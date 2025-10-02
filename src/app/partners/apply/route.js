export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAlertEmail } from "@/lib/email"; // uses your existing mailer

// Optional simple validation
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

// Basic HTML escape for email body
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return NextResponse.json({ error: "invalid_content_type" }, { status: 415 });
    }

    const body = await req.json().catch(() => ({}));

    // Honeypot: ignore bot submissions
    if (body.hp) return NextResponse.json({ ok: true });

    const {
      name,
      email,
      agency,
      website,
      verticals,
      volume,
      notes,
      utmSource,
      utmMedium,
      utmCampaign,
    } = body || {};

    if (!name || !email || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // Save to DB
    const rec = await prisma.partnerApplication.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        agency: agency ? String(agency).trim() : null,
        website: website ? String(website).trim() : null,
        verticals: verticals ? String(verticals).trim() : null,
        volume: volume ? String(volume).trim() : null,
        notes: notes ? String(notes).trim() : null,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        status: "new",
      },
    });

    // Email you (the team inbox)
    const TO = process.env.PARTNERS_INBOX || process.env.CONTACT_INBOX || process.env.ALERTS_INBOX;
    if (TO) {
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
          <h2>New Agency Partner Application</h2>
          <p><b>${esc(rec.name)}</b> &lt;${esc(rec.email)}&gt;</p>
          ${rec.agency ? `<p>Agency: ${esc(rec.agency)}</p>` : ""}
          ${rec.website ? `<p>Website: ${esc(rec.website)}</p>` : ""}
          ${rec.verticals ? `<p>Verticals: ${esc(rec.verticals)}</p>` : ""}
          ${rec.volume ? `<p>Shopify volume: ${esc(rec.volume)}</p>` : ""}
          ${rec.notes ? `<p>Notes:<br>${esc(rec.notes).replace(/\n/g, "<br>")}</p>` : ""}
          <hr>
          <p style="color:#666;font-size:12px">
            UTM: ${esc(utmSource || "-")} / ${esc(utmMedium || "-")} / ${esc(utmCampaign || "-")}<br>
            App ID: ${rec.id}
          </p>
        </div>
      `;
      await sendAlertEmail({
        to: TO,
        subject: `New Agency Partner Application — ${rec.name}`,
        html,
        text:
          `New agency application\n` +
          `Name: ${rec.name}\n` +
          `Email: ${rec.email}\n` +
          (rec.agency ? `Agency: ${rec.agency}\n` : "") +
          (rec.website ? `Website: ${rec.website}\n` : "") +
          (rec.verticals ? `Verticals: ${rec.verticals}\n` : "") +
          (rec.volume ? `Volume: ${rec.volume}\n` : "") +
          (rec.notes ? `Notes: ${rec.notes}\n` : "") +
          `UTM: ${utmSource || "-"} / ${utmMedium || "-"} / ${utmCampaign || "-"}\n` +
          `App ID: ${rec.id}\n`,
      });
    }

    // Email confirmation to applicant (best-effort)
    try {
      await sendAlertEmail({
        to: rec.email,
        subject: "Thanks — Ghost Stock Agency Partner Program",
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
            <p>Hi ${esc(rec.name)},</p>
            <p>Thanks for applying to the Ghost Stock Agency Partner Program! 
            We’ll review and reply shortly (usually within 1–2 business days).</p>
            <p>Quick recap:</p>
            <ul>
              <li>20% lifetime revenue share</li>
              <li>+£100 at 5 installs, +£250 at 15 installs</li>
              <li>Last-click attribution (90 days), payouts monthly net-30</li>
            </ul>
            <p>Questions? Reply to this email.</p>
            <p>— Ghost Stock Team</p>
          </div>
        `,
        text:
          `Hi ${rec.name},\n\n` +
          `Thanks for applying to the Ghost Stock Agency Partner Program!\n` +
          `We’ll review and reply shortly (1–2 business days).\n\n` +
          `20% lifetime rev share • +£100 at 5 installs • +£250 at 15 installs\n` +
          `Last-click attribution (90 days) • Payouts monthly net-30\n\n` +
          `— Ghost Stock Team\n`,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, id: rec.id });
  } catch (err) {
    console.error("partners.apply error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// (Optional) handle a quick CORS preflight if you ever post from external pages
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
