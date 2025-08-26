export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStore } from "@/lib/getActiveStore";

function isSlackWebhook(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

export async function GET(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    let settings = await prisma.userSettings.findUnique({ where: { userEmail: store.userEmail } });
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userEmail: store.userEmail, currency: store.currency || "GBP" },
      });
    }

    return NextResponse.json({
      settings: {
        userEmail: settings.userEmail,
        currency: settings.currency,
        plan: settings.plan,
        stripeCustomerId: settings.stripeCustomerId || null,
        slackWebhookUrl: settings.slackWebhookUrl || null,
        notificationEmail: settings.notificationEmail || null,   // <-- NEW
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: "settings_failed", message: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const store = await getActiveStore(req);
    if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const updates = {};

    if (typeof body.currency === "string" && body.currency.trim() !== "") {
      const allowed = new Set(["USD", "GBP", "EUR", "AUD", "CAD", "NZD"]);
      const currency = body.currency.toUpperCase();
      if (!allowed.has(currency)) return NextResponse.json({ error: "unsupported_currency" }, { status: 400 });
      updates.currency = currency;
    }

    if ("slackWebhookUrl" in body) {
      const raw = String(body.slackWebhookUrl || "").trim();
      if (raw === "") updates.slackWebhookUrl = null;
      else if (!isSlackWebhook(raw)) {
        return NextResponse.json({ error: "invalid_slack_webhook" }, { status: 400 });
      } else {
        updates.slackWebhookUrl = raw.slice(0, 300);
      }
    }

    if ("notificationEmail" in body) {
      const raw = String(body.notificationEmail || "").trim();
      if (raw === "") updates.notificationEmail = null;
      else if (!isEmail(raw)) {
        return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      } else {
        updates.notificationEmail = raw.slice(0, 200);
      }
    }

    const settings = await prisma.userSettings.upsert({
      where: { userEmail: store.userEmail },
      update: updates,
      create: {
        userEmail: store.userEmail,
        currency: updates.currency || store.currency || "GBP",
        slackWebhookUrl: updates.slackWebhookUrl ?? null,
        notificationEmail: updates.notificationEmail ?? null,    // <-- NEW
      },
    });

    return NextResponse.json({
      settings: {
        userEmail: settings.userEmail,
        currency: settings.currency,
        plan: settings.plan,
        stripeCustomerId: settings.stripeCustomerId || null,
        slackWebhookUrl: settings.slackWebhookUrl || null,
        notificationEmail: settings.notificationEmail || null,   // <-- NEW
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: "settings_failed", message: String(err?.message || err) }, { status: 500 });
  }
}
