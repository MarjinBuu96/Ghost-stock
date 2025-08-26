// src/lib/email.js
export async function sendAlertEmail({ to, subject, text, html }) {
  // Prefer Resend if configured
  const RESEND = process.env.RESEND_API_KEY;
  const MAIL_FROM = process.env.MAIL_FROM || "Ghost Stock <noreply@example.com>";

  if (RESEND) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html: html || `<pre>${text}</pre>` }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    return true;
  }

  // Fallback: SMTP via Nodemailer
  const host = process.env.SMTP_HOST;
  if (host) {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html: html || `<pre>${text}</pre>`,
    });
    return true;
  }

  console.warn("No email provider configured (RESEND_API_KEY or SMTP_HOST).");
  return false;
}
