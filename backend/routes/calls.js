const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const retellService = require('../services/retell');
const emailService  = require('../services/email');
const { bookingStore } = require('../services/store');

// ─────────────────────────────────────────────────────────────
// POST /api/calls/web-call
// Creates a Retell web call and returns the access_token
// Frontend uses this with RetellWebClient SDK to open a browser call
// ─────────────────────────────────────────────────────────────
router.post('/web-call', async (req, res) => {
  try {
    // Prefer RETELL_WEB_AGENT_ID; fall back to RETELL_INBOUND_AGENT_ID
    const agentId = process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID;

    if (!process.env.RETELL_API_KEY) {
      return res.status(500).json({ success: false, message: 'RETELL_API_KEY is not set.' });
    }
    if (!agentId) {
      return res.status(500).json({
        success: false,
        message: 'No web-call agent configured. Set RETELL_WEB_AGENT_ID or RETELL_INBOUND_AGENT_ID.',
      });
    }

    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent_id: agentId }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[WEB-CALL] Retell error:', data);
      return res.status(response.status).json({
        success: false,
        message: data?.message || data?.detail || 'Failed to create web call',
      });
    }

    if (!data.access_token) {
      console.error('[WEB-CALL] No access_token in Retell response:', data);
      return res.status(500).json({ success: false, message: 'Retell did not return an access_token' });
    }

    console.log(`[WEB-CALL] Created call_id: ${data.call_id} agent: ${agentId}`);

    return res.json({
      success: true,
      accessToken: data.access_token,
      callId: data.call_id,
    });

  } catch (err) {
    console.error('[WEB-CALL] Unexpected error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create web call session' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/calls/schedule
// Validates booking form, saves to store, sends emails,
// and if the slot is NOW (within 2 min) fires the call immediately.
// Otherwise the scheduler fires it at the right time.
// ─────────────────────────────────────────────────────────────
router.post('/schedule', async (req, res) => {
  try {
    const {
      name, email, phone, company,
      industry, message,
      slotDate, slotTime, slotLabel, slotTimestamp,
    } = req.body;

    // ── Validation ───────────────────────────────────────
    const errors = [];
    if (!name || name.trim().length < 2)    errors.push('Name is required (min 2 chars)');
    if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
    if (!phone || phone.trim().length < 6)   errors.push('Valid phone number is required');
    if (!industry)                           errors.push('Industry is required');
    if (!slotDate || !slotTime)              errors.push('Time slot is required');
    if (errors.length) return res.status(400).json({ success: false, errors });

    const bookingId = 'EL-' + uuidv4().substring(0, 6).toUpperCase();

    const booking = {
      id: bookingId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company?.trim() || '',
      industry,
      message: message?.trim() || '',
      slotDate,
      slotTime,
      slotLabel,
      slotTimestamp: slotTimestamp || null,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      retellCallId: null,
      ip: req.ip,
    };

    bookingStore.set(bookingId, booking);
    console.log(`[SCHEDULE] Booking saved: ${bookingId} → ${phone} at ${slotLabel} ${slotTime}`);

    // ── Send emails (non-blocking) ────────────────────────
    Promise.all([
      emailService.sendBookingConfirmation(booking),
      emailService.sendInternalNotification(booking, 'outbound_call'),
    ]).catch(err => console.error('[SCHEDULE] Email error:', err.message));

    // ── Check if we should fire immediately ───────────────
    // If slot is within the next 2 minutes, fire the call right away
    const retellConfigured =
      process.env.RETELL_OUTBOUND_NUMBER &&
      process.env.RETELL_OUTBOUND_AGENT_ID &&
      process.env.RETELL_API_KEY;

    if (retellConfigured && slotTimestamp) {
      const slotMs  = Number(slotTimestamp);
      const nowMs   = Date.now();
      const diffMin = (slotMs - nowMs) / 60000;

      if (diffMin <= 2 && diffMin >= -1) {
        console.log(`[SCHEDULE] Slot is imminent — firing call now for ${bookingId}`);
        fireOutboundCall(booking); // async, don't await — respond to client immediately
      }
    }

    return res.status(200).json({
      success: true,
      bookingId,
      message: retellConfigured
        ? `Call scheduled! Our AI agent will call ${phone} at ${slotLabel} ${slotTime}.`
        : `Booking received (ref: ${bookingId}). We'll confirm shortly.`,
      retellConfigured: !!retellConfigured,
    });

  } catch (err) {
    console.error('[SCHEDULE] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to schedule call. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Internal helper — triggers a Retell outbound call for a booking
// Called by /schedule (for immediate slots) and by the scheduler
// ─────────────────────────────────────────────────────────────
async function fireOutboundCall(booking) {
  try {
    const callResult = await retellService.scheduleOutboundCall({
      toNumber:         booking.phone,
      fromNumber:       process.env.RETELL_OUTBOUND_NUMBER,
      agentId:          process.env.RETELL_OUTBOUND_AGENT_ID,
      metadata: {
        booking_id:      booking.id,
        caller_name:     booking.name,
        caller_company:  booking.company,
        caller_industry: booking.industry,
        caller_notes:    booking.message,
        scheduled_slot:  `${booking.slotLabel} at ${booking.slotTime}`,
      },
      dynamicVariables: {
        name:             booking.name,
        company:          booking.company || 'your company',
        industry:         booking.industry,
        discussion_topic: booking.message || 'EnlightLab AI services',
      },
    });

    booking.retellCallId = callResult?.call_id;
    booking.status = 'call_initiated';
    bookingStore.set(booking.id, booking);
    console.log(`[OUTBOUND] Call initiated: ${callResult?.call_id} → ${booking.phone}`);
  } catch (err) {
    console.error(`[OUTBOUND] Call failed for ${booking.id}:`, err.message);
    booking.status = 'failed';
    bookingStore.set(booking.id, booking);
  }
}

// Export so the scheduler can reuse it
module.exports = router;
module.exports.fireOutboundCall = fireOutboundCall;

// ─────────────────────────────────────────────────────────────
// GET /api/calls/status/:bookingId
// ─────────────────────────────────────────────────────────────
router.get('/status/:bookingId', async (req, res) => {
  try {
    const booking = bookingStore.get(req.params.bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    let retellStatus = null;
    if (booking.retellCallId && process.env.RETELL_API_KEY) {
      retellStatus = await retellService.getCallStatus(booking.retellCallId);
    }

    return res.json({
      success: true,
      booking: {
        id:        booking.id,
        name:      booking.name,
        status:    booking.status,
        slotLabel: booking.slotLabel,
        slotTime:  booking.slotTime,
        createdAt: booking.createdAt,
      },
      retellStatus,
    });
  } catch (err) {
    console.error('[STATUS] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/calls/slots   — generate available time slots
// ─────────────────────────────────────────────────────────────
router.get('/slots', (req, res) => {
  const slots = [];
  const times = ['10:00 AM', '12:00 PM', '3:00 PM', '5:00 PM'];
  const now = new Date();
  let daysAdded = 0, offset = 1;

  while (daysAdded < 3) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset++);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    daysAdded++;
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    times.forEach(time => {
      const h = parseInt(time);
      const ampm = time.includes('PM') ? 'PM' : 'AM';
      let hour = h + (ampm === 'PM' && h !== 12 ? 12 : (ampm === 'AM' && h === 12 ? -12 : 0));
      const slotDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0);
      slots.push({
        id: `${d.toISOString().split('T')[0]}_${time.replace(/[: ]/g, '')}`,
        date: d.toISOString().split('T')[0],
        time,
        label,
        timestamp: slotDate.getTime(),
        available: true,
      });
    });
  }

  res.json({ success: true, slots });
});

// ─────────────────────────────────────────────────────────────
// GET /api/calls/config  — let the frontend know what's ready
// ─────────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    success: true,
    webCall: {
      configured: !!(process.env.RETELL_API_KEY && (process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID)),
    },
    outbound: {
      configured: !!(process.env.RETELL_OUTBOUND_NUMBER && process.env.RETELL_OUTBOUND_AGENT_ID && process.env.RETELL_API_KEY),
      number: process.env.RETELL_OUTBOUND_NUMBER || null,
    },
    inbound: {
      configured: !!(process.env.RETELL_INBOUND_NUMBER && process.env.RETELL_INBOUND_AGENT_ID),
      number: process.env.RETELL_INBOUND_NUMBER || null,
    },
    chat: {
      configured: !!process.env.RETELL_CHAT_AGENT_ID,
    },
  });
});
