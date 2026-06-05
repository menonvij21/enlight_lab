const express = require('express');
const router = express.Router();
const validator = require('validator');
const emailService = require('../services/email');
const { contactStore } = require('../services/store');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/contact/submit
 * Handle the "Get a Proposal" contact form
 */
router.post('/submit', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, company, service, message, countryCode } = req.body;

    // ── Validation ──────────────────────────────────────
    const errors = [];
    if (!firstName || firstName.trim().length < 2) errors.push('First name is required');
    if (!lastName || lastName.trim().length < 2) errors.push('Last name is required');
    if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
    if (!phone) errors.push('Phone number is required');
    if (errors.length) return res.status(400).json({ success: false, errors });

    const leadId = 'CF-' + uuidv4().substring(0, 6).toUpperCase();

    // FIX: The frontend sends `fullPhone` (already has countryCode prepended) AND
    // also sends `countryCode` + `phone` separately. Use `fullPhone` if provided,
    // otherwise combine countryCode + phone — but never double-prepend.
    const rawPhone = req.body.fullPhone || phone.trim();
    const fullPhone = rawPhone.startsWith('+')
      ? rawPhone
      : `${countryCode || ''}${rawPhone}`;

    const lead = {
      id: leadId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim().toLowerCase(),
      phone: fullPhone,
      company: company?.trim() || '',
      service: service || 'Not specified',
      message: message?.trim() || '',
      source: 'contact_form',
      createdAt: new Date().toISOString(),
      ip: req.ip,
    };

    contactStore.set(leadId, lead);

    // Non-blocking — email failure won't break the API response
    Promise.all([
      emailService.sendContactConfirmation(lead),
      emailService.sendInternalNotification(lead, 'contact_form'),
    ]).catch(err => console.error('[CONTACT] Email error:', err.message));

    return res.status(200).json({
      success: true,
      leadId,
      message: "Thank you! We'll get back to you within 24 hours.",
    });

  } catch (err) {
    console.error('[CONTACT] Submit error:', err.message);
    return res.status(500).json({ success: false, message: 'Submission failed. Please try again.' });
  }
});

module.exports = router;
