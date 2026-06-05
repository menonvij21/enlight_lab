const cron = require('node-cron');
const retellService = require('./retell');
const { bookingStore } = require('./store');
const emailService = require('./email');

function parseSlotTime(booking) {
  if (booking.slotTimestamp) return new Date(booking.slotTimestamp);
  if (booking.slotDate && booking.slotTime) {
    const timeMatch = booking.slotTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const meridian = timeMatch[3].toUpperCase();
      if (meridian === 'PM' && hours !== 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;
      const d = new Date(booking.slotDate);
      d.setHours(hours, minutes, 0, 0);
      return d;
    }
  }
  return null;
}

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const bookings = Array.from(bookingStore.values()).filter(
      b => b.status === 'scheduled'
    );

    for (const booking of bookings) {
      const slotTime = parseSlotTime(booking);
      if (!slotTime || slotTime > now) continue;

      console.log(`[SCHEDULER] Booking ${booking.id} slot reached. Triggering outbound call…`);

      const retellConfigured =
        process.env.RETELL_OUTBOUND_NUMBER &&
        process.env.RETELL_OUTBOUND_AGENT_ID &&
        process.env.RETELL_API_KEY;

      if (!retellConfigured) {
        console.log(`[SCHEDULER] Retell outbound not fully configured (missing number or agent ID). Skipping automatic call for ${booking.id}.`);
        booking.status = 'awaiting_number';
        bookingStore.set(booking.id, booking);
        continue;
      }

      try {
        const callResult = await retellService.scheduleOutboundCall({
          toNumber: booking.phone,
          fromNumber: process.env.RETELL_OUTBOUND_NUMBER,
          agentId: process.env.RETELL_OUTBOUND_AGENT_ID,
          metadata: {
            booking_id: booking.id,
            caller_name: booking.name,
            caller_company: booking.company,
            caller_industry: booking.industry,
            caller_notes: booking.message,
            scheduled_slot: `${booking.slotLabel} at ${booking.slotTime}`,
          },
          dynamicVariables: {
            name: booking.name,
            company: booking.company || 'your company',
            industry: booking.industry,
            discussion_topic: booking.message || 'EnlightLab AI services',
          },
        });

        booking.retellCallId = callResult?.call_id;
        booking.status = 'call_initiated';
        bookingStore.set(booking.id, booking);
        console.log(`[SCHEDULER] Call initiated: ${callResult?.call_id}`);
      } catch (err) {
        console.error(`[SCHEDULER] Failed to trigger call for ${booking.id}:`, err.message);
        booking.status = 'failed';
        bookingStore.set(booking.id, booking);
      }
    }
  });

  console.log('[SCHEDULER] Outbound call scheduler started (checks every minute)');
}

module.exports = { startScheduler };