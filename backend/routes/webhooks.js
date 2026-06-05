const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const emailService = require('../services/email');
const { bookingStore } = require('../services/store');

/**
 * Verify Retell webhook signature.
 */
function verifyRetellSignature(rawBody, signature) {
  if (!process.env.RETELL_WEBHOOK_SECRET) return true; // skip if not configured
  try {
    const expected = crypto
      .createHmac('sha256', process.env.RETELL_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const sigBuffer = Buffer.from(signature || '');
    const expectedBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/retell
 * Receives all Retell AI call lifecycle events
 */
router.post('/retell', async (req, res) => {
  // req.body may be Buffer (from express.raw) or already parsed JSON
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const signature = req.headers['x-retell-signature'];

  if (!verifyRetellSignature(rawBody, signature)) {
    console.warn('[WEBHOOK] Invalid Retell signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event: eventType, call } = event;
  console.log(`[WEBHOOK] Retell event: ${eventType} | call_id: ${call?.call_id}`);

  // Acknowledge quickly — Retell expects a fast 200
  res.status(200).json({ received: true });

  // ── Handle events asynchronously ────────────────────────
  setImmediate(async () => {
    try {
      switch (eventType) {

        case 'call_started': {
          console.log(`[WEBHOOK] Call started: ${call.call_id} → ${call.to_number}`);
          updateBookingByCallId(call.call_id, { status: 'call_in_progress' });
          break;
        }

        case 'call_ended': {
          console.log(`[WEBHOOK] Call ended: ${call.call_id}`);
          console.log(`  Duration  : ${call.duration_ms ? Math.round(call.duration_ms / 1000) + 's' : 'unknown'}`);
          console.log(`  End reason: ${call.disconnection_reason || 'unknown'}`);

          const booking = findBookingByCallId(call.call_id);
          updateBookingByCallId(call.call_id, {
            status: 'call_completed',
            duration: call.duration_ms,
            disconnectionReason: call.disconnection_reason,
            recordingUrl: call.recording_url || null,
            transcript: call.transcript || null,
          });

          if (booking) {
            await emailService.sendPostCallSummary({
              booking,
              duration: call.duration_ms,
              recordingUrl: call.recording_url,
              transcript: call.transcript,
              disconnectionReason: call.disconnection_reason,
            });
          }
          break;
        }

        case 'call_analyzed': {
          console.log(`[WEBHOOK] Call analyzed: ${call.call_id}`);
          const analysis = call.call_analysis || {};
          updateBookingByCallId(call.call_id, {
            analysis: {
              summary: analysis.call_summary,
              sentiment: analysis.user_sentiment,
              taskCompletion: analysis.call_completion_rating,
              agentSentiment: analysis.agent_sentiment,
            },
          });
          console.log(`  Sentiment : ${analysis.user_sentiment}`);
          console.log(`  Summary   : ${analysis.call_summary}`);
          break;
        }

        default:
          console.log(`[WEBHOOK] Unhandled event type: ${eventType}`);
      }
    } catch (err) {
      console.error('[WEBHOOK] Handler error:', err.message);
    }
  });
});

/**
 * POST /api/webhooks/retell-chat
 * Handles Retell chat agent events (web chat SDK callbacks)
 */
router.post('/retell-chat', (req, res) => {
  let event;
  try {
    event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.log('[WEBHOOK] Chat event:', event.event, event.conversation_id);
  res.status(200).json({ received: true });
});

// ── Helpers ─────────────────────────────────────────────────
function findBookingByCallId(callId) {
  for (const [, booking] of bookingStore) {
    if (booking.retellCallId === callId) return booking;
  }
  return null;
}

function updateBookingByCallId(callId, updates) {
  for (const [id, booking] of bookingStore) {
    if (booking.retellCallId === callId) {
      bookingStore.set(id, { ...booking, ...updates, updatedAt: new Date().toISOString() });
      return;
    }
  }
}

module.exports = router;