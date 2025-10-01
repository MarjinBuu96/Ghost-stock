// src/lib/email.js
import 'server-only';

const fromDefault =
  process.env.EMAIL_FROM ||
  process.env.MAIL_FROM ||
  'Ghost Stock <no-reply@ghost-stock.co.uk>';

export async function sendAlertEmail({ to, subject, html, text }) {
  if (!to) throw new Error('sendAlertEmail: missing "to"');
  if (!subject) throw new Error('sendAlertEmail: missing "subject"');

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('[email] SMTP not configured, skipping send', { to, subject });
    return { ok: false, skipped: 'no_smtp' };
  }

  const nodemailerMod = await import('nodemailer');
  const nodemailer = nodemailerMod.default || nodemailerMod;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465; // 587 => STARTTLS (secure:false)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // authMethod: "LOGIN", // uncomment if Brevo ever complains about AUTH PLAIN
  });

  // Optional verification step (use a different var name)
  try {
    await transporter.verify();
  } catch (e) {
    console.error('[email] transporter.verify failed:', e);
    throw e;
  }

  const sendInfo = await transporter.sendMail({
    from: fromDefault,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    replyTo: process.env.EMAIL_REPLY_TO || undefined, // standard reply-to
    bcc: process.env.EMAIL_BCC_AUDIT || undefined,    // you get BCC'd
  });

  return { ok: true, id: sendInfo?.messageId || null };
}

// Optional alias for older imports
export const sendMail = sendAlertEmail;
