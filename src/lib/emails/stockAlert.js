// src/lib/emails/stockAlert.js
import { sendAlertEmail } from "@/lib/email";

const BRAND = {
  name: "Ghost Stock",
  primary: "#5b8def",           // button & accents
  text: "#111827",              // slate-900
  muted: "#6b7280",             // slate-500
  bg: "#f5f7fb",                // soft background
  card: "#ffffff",              // email "card"
  border: "#e5e7eb",            // slate-200
  logoUrl: "https://app.ghost-stock.co.uk/logo.png", // replace or remove the <img>
};

export async function sendStockAlert({
  to,
  productName,
  currentQty,
  threshold,
  productUrl,                 // optional: deep link to product
  dashboardUrl = "https://app.ghost-stock.co.uk/dashboard",
  replyTo,                    // optional override (see Discord note below)
}) {
  const subject = `⚠️ Low stock: ${productName}`;
  const preheader = `${productName} is at ${currentQty} (threshold ${threshold})`;
  const actionUrl = productUrl || dashboardUrl;

  const html = `
  <!doctype html>
  <html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
    <style>
      /* Some clients respect <style>; we still inline critical styles below */
      @media (max-width: 600px) {
        .container { width: 100% !important; padding: 0 16px !important; }
        .card { padding: 20px !important; }
        .btn { display:block !important; width:100% !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background:${BRAND.bg}; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
    <!-- Preheader (hidden in clients) -->
    <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;">
      ${escapeHtml(preheader)}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px; max-width:100%;">
            <!-- Header -->
            <tr>
              <td style="padding: 0 4px 16px 4px; text-align:left;">
                <a href="https://app.ghost-stock.co.uk" style="text-decoration:none; display:inline-flex; align-items:center;">
                  <img src="${BRAND.logoUrl}" alt="${BRAND.name}" height="28" style="display:inline-block; border:0; height:28px; margin-right:10px;">
                  <span style="font:600 18px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,'Apple Color Emoji','Segoe UI Emoji'; color:${BRAND.text};">${BRAND.name}</span>
                </a>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td>
                <table class="card" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.card}; border:1px solid ${BRAND.border}; border-radius:12px; overflow:hidden; padding:28px;">
                  <tr>
                    <td>
                      <h1 style="margin:0 0 8px 0; font:700 20px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,'Apple Color Emoji','Segoe UI Emoji'; color:${BRAND.text};">
                        Low stock alert
                      </h1>
                      <p style="margin:0 0 16px 0; font:400 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.muted};">
                        One of your products is running low.
                      </p>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate; border-spacing:0 8px; margin: 8px 0 20px 0;">
                        <tr>
                          <td style="font:600 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text}; width:160px;">Product</td>
                          <td style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text};">${escapeHtml(productName)}</td>
                        </tr>
                        <tr>
                          <td style="font:600 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text};">Current quantity</td>
                          <td style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text};">${String(currentQty)}</td>
                        </tr>
                        <tr>
                          <td style="font:600 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text};">Threshold</td>
                          <td style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.text};">${String(threshold)}</td>
                        </tr>
                      </table>

                      <!-- Button -->
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 16px 0;">
                        <tr>
                          <td>
                            <a class="btn" href="${actionUrl}"
                               style="display:inline-block; background:${BRAND.primary}; color:#fff; text-decoration:none; font:600 14px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; padding:12px 18px; border-radius:8px;">
                              Open in Ghost Stock
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:16px 0 0 0; font:400 12px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:${BRAND.muted};">
                        You’re receiving this alert because a low-stock rule matched this product.
                        You can adjust thresholds in your dashboard settings.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="text-align:center; padding:16px 8px; color:${BRAND.muted}; font:400 12px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;">
                © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text =
`Low stock alert

Product: ${productName}
Current quantity: ${currentQty}
Threshold: ${threshold}

Open: ${actionUrl}
— ${BRAND.name}`;

  // If you want all replies to go to support, set a default here:
  const replyToHeader = replyTo || process.env.EMAIL_REPLY_TO || undefined;

  return sendAlertEmail({
    to,
    subject,
    html,
    text,
    // add headers below:
    replyTo: replyToHeader,
    // bcc: process.env.EMAIL_BCC_AUDIT || undefined,
  });
}

/* --- helpers --- */
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
