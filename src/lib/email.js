// src/lib/email.js
let transporter = null;

/**
 * Create (or reuse) a transporter.
 * - If SMTP_* env vars exist, try to dynamically import nodemailer and use it.
 * - If nodemailer or SMTP isn’t available, return a fake transporter that just logs.
 */
async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // If no SMTP config, return a fake sender
  if (!host || !port) {
    transporter = {
      async sendMail(opts) {
        console.log("[EMAIL-FAKE]", {
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
        });
        return { messageId: "dev-fake" };
      },
    };
    return transporter;
  }

  // Try dynamic import only when SMTP is configured
  try {
    const nodemailerMod = await import("nodemailer");
    const nodemailer = nodemailerMod.default || nodemailerMod;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465; false for 587/1025/etc
      auth: user && pass ? { user, pass } : undefined,
    });

    return transporter;
  } catch (e) {
    console.warn("nodemailer not available, falling back to fake email:", e?.message || e);
    transporter = {
      async sendMail(opts) {
        console.log("[EMAIL-FAKE]", {
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
        });
        return { messageId: "dev-fake" };
      },
    };
    return transporter;
  }
}

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || "Ghost Stock <no-reply@localhost.test>";
  const tx = await getTransporter();
  return tx.sendMail({ from, to, subject, text, html });
}
