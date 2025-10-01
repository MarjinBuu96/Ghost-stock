// C:\Users\rapwr\ghost-stock\src\lib\email.js
import 'server-only';

const fromDefault =
  process.env.EMAIL_FROM ||
  process.env.MAIL_FROM ||
  'Ghost Stock <no-reply@localhost.test>';

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

 const info = await transporter.sendMail({
  from: fromDefault,
  to,
  subject,
  text: text || undefined,
  html: html || undefined,
  replyTo: process.env.EMAIL_REPLY_TO || undefined,     // 👈 standard reply-to
  bcc: process.env.EMAIL_BCC_AUDIT || undefined,        // 👈 you get BCC'd
});


  // Optional but helpful during setup
  try {
    await transporter.verify();
  } catch (e) {
    console.error('[email] transporter.verify failed:', e);
    throw e;
  }

  const info = await transporter.sendMail({
    from: fromDefault,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return { ok: true, id: info?.messageId || null };
}

export const sendMail = sendAlertEmail;
