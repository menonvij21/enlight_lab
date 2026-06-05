/**
 * email.js
 * Nodemailer-based email service for all transactional emails
 */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

async function send(to, subject, html, text) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[EMAIL] Not configured — skipping: "${subject}" to ${to}`);
    return;
  }
  try {
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html,
    });
    console.log(`[EMAIL] Sent "${subject}" to ${to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[EMAIL] Failed to send "${subject}":`, err.message);
    // Don't throw — email failure shouldn't break the API response
  }
}

// ─── TEMPLATES ───────────────────────────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6fb; margin: 0; padding: 0; }
    .wrapper { max-width: 580px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .header { background: #0D1B6E; padding: 28px 36px; }
    .header h1 { color: #fff; margin: 0; font-size: 1.3rem; }
    .header span { color: rgba(255,255,255,.6); font-size: .85rem; }
    .body { padding: 32px 36px; color: #3B4A6B; font-size: .93rem; line-height: 1.7; }
    .body h2 { color: #0C1A3A; font-size: 1.15rem; margin-top: 0; }
    .detail-box { background: #f4f6fb; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .detail-row { display: flex; gap: 12px; margin: 6px 0; font-size: .88rem; }
    .detail-label { color: #6B7A9E; min-width: 110px; font-weight: 600; }
    .detail-value { color: #0C1A3A; font-weight: 500; }
    .badge { display: inline-block; background: #1E3FFF; color: #fff; border-radius: 6px; padding: 6px 14px; font-size: .82rem; font-weight: 700; letter-spacing: .04em; margin: 8px 0; }
    .btn { display: inline-block; background: #1E3FFF; color: #fff !important; border-radius: 7px; padding: 12px 24px; font-weight: 700; text-decoration: none; margin: 16px 0; font-size: .9rem; }
    .footer { background: #f4f6fb; padding: 20px 36px; color: #9aa5bf; font-size: .78rem; border-top: 1px solid #e8ecf5; }
    .divider { border: none; border-top: 1px solid #e8ecf5; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Enlight Lab</h1>
      <span>Next-Gen AI-Powered Solutions</span>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      © 2026 EnlightLab · contact@enlightlab.com<br>
      This email was sent because you interacted with our website.
    </div>
  </div>
</body>
</html>`;
}

// ─── OUTBOUND BOOKING CONFIRMATION (to lead) ─────────────────────────────────
async function sendBookingConfirmation(booking) {
  const html = baseTemplate(`
    <h2>Your AI Demo Call is Confirmed! 🎉</h2>
    <p>Hi ${booking.name},</p>
    <p>Great news — your AI demo call with EnlightLab has been scheduled. Our AI voice agent will call you at your chosen time.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${booking.id}</span></div>
      <div class="detail-row"><span class="detail-label">Time Slot</span><span class="detail-value">${booking.slotLabel} at ${booking.slotTime}</span></div>
      <div class="detail-row"><span class="detail-label">Call To</span><span class="detail-value">${booking.phone}</span></div>
      <div class="detail-row"><span class="detail-label">Industry</span><span class="detail-value">${booking.industry}</span></div>
      ${booking.company ? `<div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${booking.company}</span></div>` : ''}
    </div>
    <p><strong>What to expect:</strong></p>
    <ul>
      <li>Our AI voice agent will call your number at the scheduled time</li>
      <li>The conversation is fully natural — ask anything, interrupt anytime</li>
      <li>The agent is pre-briefed on your industry and discussion notes</li>
      <li>Average call duration: 5–10 minutes</li>
    </ul>
    <hr class="divider">
    <p style="font-size:.85rem;color:#6B7A9E">If you need to reschedule, simply reply to this email and we'll sort it out.</p>
  `);

  await send(booking.email, `✅ AI Demo Call Confirmed — ${booking.slotLabel} at ${booking.slotTime}`, html);
}

// ─── POST-CALL SUMMARY (to lead, after call ends) ────────────────────────────
async function sendPostCallSummary({ booking, duration, recordingUrl, transcript, disconnectionReason }) {
  if (!booking) return;
  const durationStr = duration ? `${Math.round(duration / 1000)}s` : 'N/A';

  const html = baseTemplate(`
    <h2>Your AI Call Summary 📞</h2>
    <p>Hi ${booking.name},</p>
    <p>Thanks for speaking with our AI agent! Here's a summary of your call.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${booking.id}</span></div>
      <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${durationStr}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${disconnectionReason || 'Completed'}</span></div>
    </div>
    ${recordingUrl ? `<p><a href="${recordingUrl}" class="btn">🎧 Listen to Recording</a></p>` : ''}
    ${transcript ? `
      <p><strong>Transcript excerpt:</strong></p>
      <div class="detail-box" style="font-size:.85rem;font-family:monospace;white-space:pre-wrap">${transcript.slice(0, 1200)}${transcript.length > 1200 ? '…' : ''}</div>
    ` : ''}
    <p>Our human team will follow up with a tailored proposal within 24 hours.</p>
    <a href="${process.env.FRONTEND_URL || 'https://enlightlab.com'}#contact" class="btn">Get a Full Proposal</a>
  `);

  await send(booking.email, `📞 Your EnlightLab AI Call Summary — ${booking.id}`, html);
}

// ─── CONTACT FORM CONFIRMATION (to lead) ─────────────────────────────────────
async function sendContactConfirmation(lead) {
  const html = baseTemplate(`
    <h2>We received your message! 👋</h2>
    <p>Hi ${lead.firstName},</p>
    <p>Thanks for reaching out to EnlightLab. We've received your project inquiry and our team will get back to you within 24 hours.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${lead.id}</span></div>
      <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">${lead.service}</span></div>
      ${lead.company ? `<div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${lead.company}</span></div>` : ''}
    </div>
    ${lead.message ? `<p><em>"${lead.message.slice(0, 300)}"</em></p>` : ''}
    <p>In the meantime, feel free to explore our case studies or try our AI voice agent demo.</p>
    <a href="${process.env.FRONTEND_URL || 'https://enlightlab.com'}#ai-agents" class="btn">Try AI Demo</a>
  `);

  await send(lead.email, `We got your message, ${lead.firstName}! — EnlightLab`, html);
}

// ─── INTERNAL TEAM NOTIFICATION ──────────────────────────────────────────────
async function sendInternalNotification(data, type) {
  const to = process.env.EMAIL_TO;
  if (!to) return;

  let subject, html;

  if (type === 'outbound_call') {
    subject = `🔔 New Demo Call Booked — ${data.name} (${data.industry})`;
    html = baseTemplate(`
      <h2>New Outbound Demo Call Scheduled</h2>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${data.id}</span></div>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${data.name}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${data.email}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${data.phone}</span></div>
        <div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${data.company || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Industry</span><span class="detail-value">${data.industry}</span></div>
        <div class="detail-row"><span class="detail-label">Slot</span><span class="detail-value">${data.slotLabel} @ ${data.slotTime}</span></div>
        <div class="detail-row"><span class="detail-label">Retell Call ID</span><span class="detail-value">${data.retellCallId || 'Pending'}</span></div>
      </div>
      ${data.message ? `<p><strong>Their notes:</strong><br>${data.message}</p>` : ''}
    `);
  } else {
    subject = `🔔 New Contact Form Lead — ${data.fullName} (${data.service})`;
    html = baseTemplate(`
      <h2>New Contact Form Submission</h2>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Lead ID</span><span class="detail-value">${data.id}</span></div>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${data.fullName}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${data.email}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${data.phone}</span></div>
        <div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">${data.company || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">${data.service}</span></div>
      </div>
      ${data.message ? `<p><strong>Message:</strong><br>${data.message}</p>` : ''}
    `);
  }

  await send(to, subject, html);
}

module.exports = {
  sendBookingConfirmation,
  sendPostCallSummary,
  sendContactConfirmation,
  sendInternalNotification,
};
