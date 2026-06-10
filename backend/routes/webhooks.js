const express = require('express');
const router = express.Router();
const emailService = require('../services/email');
const { bookingStore } = require('../services/store');

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/retell
// Retell sends call lifecycle events here.
// Configure this URL in your Retell dashboard under Webhooks.
// ─────────────────────────────────────────────────────────────
router.post('/retell', async (req, res) => {
  try {
    // req.body is a raw Buffer (express.raw is used for this route in server.js)
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    let event;

    try {
      event = JSON.parse(raw);
    } catch (e) {
      console.error('[WEBHOOK] Invalid JSON:', e.message);
      return res.status(400).json({ success: false, message: 'Invalid JSON' });
    }

    const eventType = event?.event;
    const callData  = event?.data || event?.call || event;

    console.log(`[WEBHOOK] Retell event: ${eventType} — call_id: ${callData?.call_id}`);

    // ── call_ended ────────────────────────────────────────
    if (eventType === 'call_ended' || eventType === 'call_analyzed') {
      const callId  = callData?.call_id;
      const bookingId = callData?.metadata?.booking_id;

      // Find matching booking
      let booking = null;
      if (bookingId) {
        booking = bookingStore.get(bookingId);
      } else if (callId) {
        // Search by retellCallId as fallback
        for (const b of bookingStore.values()) {
          if (b.retellCallId === callId) { booking = b; break; }
        }
      }

      if (booking) {
        // Update status
        booking.status = eventType === 'call_analyzed' ? 'analyzed' : 'completed';
        booking.retellCallId = callId || booking.retellCallId;
        bookingStore.set(booking.id, booking);

        // Send post-call summary email to the caller
        await emailService.sendPostCallSummary({
          booking,
          duration:             callData?.duration_ms,
          recordingUrl:         callData?.recording_url,
          transcript:           callData?.transcript,
          disconnectionReason:  callData?.disconnection_reason,
        }).catch(err => console.error('[WEBHOOK] Post-call email error:', err.message));

        console.log(`[WEBHOOK] Updated booking ${booking.id} → ${booking.status}`);
      } else {
        console.warn(`[WEBHOOK] No booking found for call_id: ${callId} / booking_id: ${bookingId}`);
      }
    }

    // ── call_started ──────────────────────────────────────
    if (eventType === 'call_started') {
      const callId    = callData?.call_id;
      const bookingId = callData?.metadata?.booking_id;
      if (bookingId) {
        const booking = bookingStore.get(bookingId);
        if (booking) {
          booking.status = 'in_progress';
          booking.retellCallId = callId;
          bookingStore.set(bookingId, booking);
          console.log(`[WEBHOOK] Call in progress: ${callId} for booking ${bookingId}`);
        }
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
    // Always 200 to prevent Retell from retrying
    return res.status(200).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/webhooks/retell  — health check for the webhook URL
// ─────────────────────────────────────────────────────────────
router.get('/retell', (req, res) => {
  res.json({ success: true, message: 'Retell webhook endpoint is active' });
});

module.exports = router;
