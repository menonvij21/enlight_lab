/**
 * scheduler.js
 * Runs every minute, finds bookings whose slot time has arrived,
 * and fires the Retell outbound call via the shared helper in routes/calls.js
 */

const cron = require('node-cron');
const { bookingStore } = require('./store');

// Lazy-require to avoid circular dependency issues at startup
function getFireFn() {
  return require('../routes/calls').fireOutboundCall;
}

// ─────────────────────────────────────────────────────────────
// Parse a booking's slot into a Date object
// Uses slotTimestamp (ms epoch) if available; falls back to
// slotDate + slotTime string parsing.
// ─────────────────────────────────────────────────────────────
function parseSlotTime(booking) {
  if (booking.slotTimestamp) return new Date(Number(booking.slotTimestamp));

  if (booking.slotDate && booking.slotTime) {
    const match = booking.slotTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      let hours   = parseInt(match[1]);
      const mins  = parseInt(match[2]);
      const ampm  = match[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours  =  0;
      const d = new Date(booking.slotDate);
      d.setHours(hours, mins, 0, 0);
      return d;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Start the cron job — checks every minute
// ─────────────────────────────────────────────────────────────
function startScheduler() {
  const retellConfigured =
    process.env.RETELL_OUTBOUND_NUMBER &&
    process.env.RETELL_OUTBOUND_AGENT_ID &&
    process.env.RETELL_API_KEY;

  if (!retellConfigured) {
    console.warn('[SCHEDULER] Outbound not fully configured — scheduler will save bookings but skip auto-calls');
    console.warn('[SCHEDULER] Missing:', [
      !process.env.RETELL_API_KEY          && 'RETELL_API_KEY',
      !process.env.RETELL_OUTBOUND_NUMBER  && 'RETELL_OUTBOUND_NUMBER',
      !process.env.RETELL_OUTBOUND_AGENT_ID && 'RETELL_OUTBOUND_AGENT_ID',
    ].filter(Boolean).join(', '));
  }

  cron.schedule('* * * * *', async () => {
    const now = Date.now();

    const due = Array.from(bookingStore.values()).filter(b => {
      if (b.status !== 'scheduled') return false;
      const slot = parseSlotTime(b);
      if (!slot) return false;
      // Fire if the slot is within the past 2 minutes (handles missed ticks)
      const diffMs = now - slot.getTime();
      return diffMs >= 0 && diffMs < 2 * 60 * 1000;
    });

    if (due.length === 0) return;

    console.log(`[SCHEDULER] ${due.length} booking(s) due`);

    for (const booking of due) {
      if (!retellConfigured) {
        console.log(`[SCHEDULER] Skipping call for ${booking.id} — outbound not configured`);
        booking.status = 'awaiting_number';
        bookingStore.set(booking.id, booking);
        continue;
      }

      try {
        await getFireFn()(booking);
      } catch (err) {
        console.error(`[SCHEDULER] Failed for ${booking.id}:`, err.message);
      }
    }
  });

  console.log('[SCHEDULER] Started — checks every minute for due outbound calls');
}

module.exports = { startScheduler };
