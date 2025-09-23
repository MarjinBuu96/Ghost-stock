// server-only email helper that works with SMTP (nodemailer) if available.
// If SMTP env isn’t set, it no-ops cleanly (so dev/prod won’t crash).
import 'server-only';

const fromDefault =
  process.env.EMAIL_FROM ||
  process.env.MAIL_FROM ||
  'Ghost Stock <no-reply@localhost.test>';

export async function sendAlertEmail({ to, subject, html, text }) {
  if (!to) throw new Error('sendAlertEmail: missing "to"');
  if (!subject) throw new Error('sendAlertEmail: missing "subject"');

  // Only attempt SMTP if configured
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('[email] SMTP not configured, skipping send', {
      to,
      subject,
    });
    return { ok: false, skipped: 'no_smtp' };
  }

  // nodemailer must be in dependencies: `npm i nodemailer`
  const nodemailerMod = await import('nodemailer');
  const nodemailer = nodemailerMod.default || nodemailerMod;

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Boolean(process.env.SMTP_SECURE === 'true'), // false = STARTTLS
    auth: (process.env.SMTP_USER || process.env.SMTP_PASS)
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

  const info = await transporter.sendMail({
    from: fromDefault,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return { ok: true, id: info?.messageId || null };
}

// Optional alias for any older imports
export const sendMail = sendAlertEmail;
