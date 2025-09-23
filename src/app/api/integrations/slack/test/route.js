export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { hasFeature, FEATURES, normalizePlan } from "@/lib/entitlements";

export async function POST(req) {
  // Any auth that you already use elsewhere:
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userEmail: token.email },
    select: { plan: true, slackWebhookUrl: true },
  });

  const plan = normalizePlan(settings?.plan || "starter");
  if (!hasFeature(plan, FEATURES.SLACK_WEBHOOK)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 });
  }
  const webhook = settings?.slackWebhookUrl?.trim();
  if (!webhook) return NextResponse.json({ error: "no_webhook" }, { status: 400 });

  const resp = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "✅ Ghost Stock: Slack test message" }),
  });
  if (!resp.ok) return NextResponse.json({ error: "slack_failed" }, { status: 502 });

  return NextResponse.json({ ok: true });
}
