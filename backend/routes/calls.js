const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const retellService = require('../services/retell');
const emailService = require('../services/email');
const { bookingStore } = require('../services/store');

/**
 * POST /api/calls/web-call
 * Creates a Retell web call session and returns the access_token
 * The frontend uses this token with the Retell Web SDK to start a browser call
 */
router.post('/web-call', async (req, res) => {
  try {
    const agentId = process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID;
    if (!agentId) {
      return res.status(500).json({
        success: false,
        message: 'Web call agent not configured. Set RETELL_WEB_AGENT_ID in environment variables.',
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
        message: data?.message || 'Failed to create web call',
      });
    }

    return res.json({
      success: true,
      accessToken: data.access_token,
      callId: data.call_id,
    });

  } catch (err) {
    console.error('[WEB-CALL] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create web call session' });
  }
});

/**
 * POST /api/calls/schedule
 * Schedule an outbound AI demo call via Retell
 */
router.post('/schedule', async (req, res) => {
  try {
    const {
      name, email, phone, company,
      industry, message,
      slotDate, slotTime, slotLabel, slotTimestamp,
    } = req.body;

    const errors = [];
    if (!name || name.trim().length < 2) errors.push('Name is required (min 2 chars)');
    if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
    if (!phone || !validator.isMobilePhone(phone, 'any', { strictMode: false }))
      errors.push('Valid phone number is required');
    if (!industry) errors.push('Industry is required');
    if (!slotDate || !slotTime) errors.push('Time slot is required');

    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

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
      ip: req.ip,
    };

    bookingStore.set(bookingId, booking);

    await emailService.sendBookingConfirmation(booking);
    await emailService.sendInternalNotification(booking, 'outbound_call');

    const retellConfigured =
      process.env.RETELL_OUTBOUND_NUMBER &&
      process.env.RETELL_OUTBOUND_AGENT_ID &&
      process.env.RETELL_API_KEY;

    return res.status(200).json({
      success: true,
      bookingId,
      message: retellConfigured
        ? `Call scheduled! Our AI agent will call ${phone} at the selected time.`
        : `Booking received (ref: ${bookingId}). We'll be in touch soon.`,
      retellConfigured: !!retellConfigured,
    });

  } catch (err) {
    console.error('[CALLS] Schedule error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to schedule call. Please try again.',
    });
  }
});

/**
 * GET /api/calls/status/:bookingId
 */
router.get('/status/:bookingId', async (req, res) => {
  try {
    const booking = bookingStore.get(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    let retellStatus = null;
    if (booking.retellCallId && process.env.RETELL_API_KEY) {
      retellStatus = await retellService.getCallStatus(booking.retellCallId);
    }

    return res.json({
      success: true,
      booking: {
        id: booking.id,
        name: booking.name,
        status: booking.status,
        slotLabel: booking.slotLabel,
        slotTime: booking.slotTime,
        createdAt: booking.createdAt,
      },
      retellStatus,
    });
  } catch (err) {
    console.error('[CALLS] Status error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

/**
 * GET /api/calls/slots
 */
router.get('/slots', (req, res) => {
  const slots = [];
  const times = ['10:00 AM', '12:00 PM', '3:00 PM', '5:00 PM'];
  const now = new Date();
  let daysAdded = 0;
  let offset = 1;

  while (daysAdded < 3) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    offset++;
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    daysAdded++;
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    times.forEach(time => {
      slots.push({
        id: `${d.toISOString().split('T')[0]}_${time.replace(/[: ]/g, '')}`,
        date: d.toISOString().split('T')[0],
        time,
        label,
        available: true,
      });
    });
  }

  res.json({ success: true, slots });
});

/**
 * GET /api/calls/config
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    inbound: {
      configured: !!(process.env.RETELL_INBOUND_NUMBER && process.env.RETELL_INBOUND_AGENT_ID),
      number: process.env.RETELL_INBOUND_NUMBER || null,
      agentId: process.env.RETELL_INBOUND_AGENT_ID || null,
    },
    outbound: {
      configured: !!(process.env.RETELL_OUTBOUND_NUMBER && process.env.RETELL_OUTBOUND_AGENT_ID && process.env.RETELL_API_KEY),
      number: process.env.RETELL_OUTBOUND_NUMBER || null,
      agentId: process.env.RETELL_OUTBOUND_AGENT_ID || null,
    },
    chat: {
      configured: !!process.env.RETELL_CHAT_AGENT_ID,
      agentId: process.env.RETELL_CHAT_AGENT_ID || null,
    },
    webCall: {
      configured: !!(process.env.RETELL_API_KEY && (process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID)),
    },
  });
});

module.exports = router;
