export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { hasFeature, FEATURES, normalizePlan } from "@/lib/entitlements";
import { sendAlertEmail } from "@/lib/email";

export async function POST(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userEmail: token.email },
    select: { plan: true, notificationEmail: true },
  });

  const plan = normalizePlan(settings?.plan || "starter");
  if (!hasFeature(plan, FEATURES.EMAIL_ALERTS)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 });
  }

  const to = settings?.notificationEmail;
  if (!to) return NextResponse.json({ error: "no_email" }, { status: 400 });

  try {
    await sendAlertEmail({
      to,
      subject: "Ghost Stock — Test Email",
      html: "<p>✅ Your Ghost Stock email integration is working.</p>",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Email test failed:", e);
    return NextResponse.json({ error: "email_failed" }, { status: 502 });
  }
}
