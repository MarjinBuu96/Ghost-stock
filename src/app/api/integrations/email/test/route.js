// src/app/api/integrations/email/test/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePlan } from "@/lib/entitlements";
import { getActiveStore } from "@/lib/getActiveStore";
import { sendMail } from "@/lib/email";

export async function POST(req) {
  try {
    // Identify current embedded Shopify store
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Read plan + notification email from settings
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true, notificationEmail: true },
    });

    const plan = normalizePlan(settings?.plan || "starter");
    if (plan === "starter") {
      return NextResponse.json(
        { error: "feature_not_in_plan", message: "Email alerts require Pro or Enterprise." },
        { status: 403 }
      );
    }

    const to = (settings?.notificationEmail || "").trim();
    if (!to) {
      return NextResponse.json(
        { error: "no_notification_email", message: "Set a Notification Email in Settings first." },
        { status: 400 }
      );
    }

    // Send a simple test/preview email
    await sendMail({
      to,
      subject: "Ghost Stock – test alert",
      text:
        `This is a test alert from Ghost Stock for ${store.shop}.\n` +
        `If you received this, email alerts are working.`,
      html:
        `<p>This is a <strong>test alert</strong> from Ghost Stock for <code>${store.shop}</code>.</p>` +
        `<p>If you received this, email alerts are working.</p>`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("email test failed:", e);
    return NextResponse.json({ error: "email_failed", message: String(e?.message || e) }, { status: 500 });
  }
}
