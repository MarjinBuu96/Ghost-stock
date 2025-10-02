export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAlertEmail } from "@/lib/email"; 

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      name = "",
      email = "",
      agency = "",
      website = "",
      verticals = "",
      volume = "",
      notes = "",
      utmSource = "",
      utmMedium = "",
      utmCampaign = "",
      hp = "", // honeypot
    } = body || {};

    // Honeypot → silently accept
    if (String(hp || "").trim() !== "") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (!name || !validEmail(email)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // Persist lead if you’ve added a PartnerLead model (optional)
    try {
      if (prisma?.partnerLead) {
        await prisma.partnerLead.create({
          data: {
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
          },
        });
      }
    } catch (e) {
      console.warn("[partners/apply] DB write failed (non-fatal):", e?.message || e);
    }

    // Email notification
    const to = process.env.PARTNERS_INBOX || "partners@ghost-stock.co.uk";
    const subject = `New Partner Application — ${agency || name}`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>New Partner Application</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Agency:</b> ${agency || "-"}</p>
        <p><b>Website:</b> ${website || "-"}</p>
        <p><b>Clients/verticals:</b> ${verticals || "-"}</p>
        <p><b>Expected monthly installs:</b> ${volume || "-"}</p>
        <p><b>Notes:</b><br/>${(notes || "").replace(/\n/g, "<br/>")}</p>
        <hr/>
        <p style="color:#666;font-size:12px">UTM: ${utmSource || "-"} / ${utmMedium || "-"} / ${utmCampaign || "-"}</p>
      </div>
    `;
    const text =
      `New Partner Application\n` +
      `Name: ${name}\nEmail: ${email}\nAgency: ${agency}\nWebsite: ${website}\n` +
      `Clients/verticals: ${verticals}\nMonthly installs: ${volume}\nNotes: ${notes}\n` +
      `UTM: ${utmSource} / ${utmMedium} / ${utmCampaign}`;

    try {
      await sendAlertEmail({ to, subject, html, text });
    } catch (e) {
      console.warn("[partners/apply] email send failed (non-fatal):", e?.message || e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("partners/apply crash:", err);
    return NextResponse.json(
      { error: "server_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
