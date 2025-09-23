// src/lib/lifecycle.js
import { prisma } from "@/lib/prisma";
import { normalizePlan, hasFeature, FEATURES } from "@/lib/entitlements";

// Soft trial window (days) – adjust if/when you wire real Shopify trials
const TRIAL_DAYS = Number(process.env.SHOPIFY_TRIAL_DAYS || 7);

export function deriveTrialDates(createdAt) {
  const start = createdAt ? new Date(createdAt) : new Date();
  const end = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
  return { trialStartAt: start, trialEndsAt: end, trialDaysLeft: daysLeft };
}

/**
 * Collect the minimal info needed for banners/emails for a single store.
 * We infer: lastAlertAt as a proxy for "last scan", total alerts last 7 days, etc.
 */
export async function getLifecycleStatusForStore(store) {
  if (!store) return null;

  // Load settings (plan, integrations, currency)
  const settings = await prisma.userSettings.findUnique({
    where: { userEmail: store.userEmail },
    select: {
      plan: true,
      currency: true,
      slackWebhookUrl: true,
      notificationEmail: true,
      createdAt: true,
    },
  });

  const plan = normalizePlan(settings?.plan || "starter");
  const canUseIntegrations = hasFeature(plan, FEATURES.SLACK_WEBHOOK) || hasFeature(plan, FEATURES.TEAMS_WEBHOOK);

  // Alerts: latest + count last 7 days
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [latestAlert, count7d] = await Promise.all([
    prisma.alert.findFirst({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.alert.count({
      where: { storeId: store.id, createdAt: { gte: since7d } },
    }),
  ]);

  const lastAlertAt = latestAlert?.createdAt || null;
  const installedAt = settings?.createdAt || store.createdAt;
  const { trialStartAt, trialEndsAt, trialDaysLeft } = deriveTrialDates(installedAt);

  return {
    shop: store.shop,
    plan,
    canUseIntegrations,
    slackConfigured: !!settings?.slackWebhookUrl,
    emailConfigured: !!settings?.notificationEmail,
    currency: settings?.currency || "GBP",
    installedAt,
    lastAlertAt,
    alerts7d: count7d,
    trialStartAt,
    trialEndsAt,
    trialDaysLeft,
  };
}

/**
 * Turn a status object into banner "nudges" for the UI.
 * Return an array of { id, severity, title, body, ctaText, href or action }
 */
export function buildNudgeBanners(status) {
  if (!status) return [];

  const nudges = [];
  const now = new Date();

  const hoursSinceInstall = (now - new Date(status.installedAt)) / 36e5;
  const hasEverScanned = !!status.lastAlertAt;

  // 1) First scan nudge (no alerts yet)
  if (!hasEverScanned && hoursSinceInstall > 2) {
    nudges.push({
      id: "first-scan",
      severity: "info",
      title: "Run your first scan",
      body: "Find ghost stock in minutes. We’ll compute KPIs and suggest fixes.",
      ctaText: "Run Scan",
      action: { type: "POST", url: "/api/shopify/scan" },
    });
  }

  // 2) Integrations nudge (Pro/Enterprise but not configured)
  if (status.canUseIntegrations && (!status.slackConfigured || !status.emailConfigured)) {
    nudges.push({
      id: "connect-integrations",
      severity: "info",
      title: "Route alerts where your team works",
      body: !status.slackConfigured && !status.emailConfigured
        ? "Connect Slack and Email so you never miss a ghost-stock spike."
        : !status.slackConfigured
        ? "Add a Slack webhook so alerts hit the right channel instantly."
        : "Add a notification email to receive daily summaries and alerts.",
      ctaText: "Open Integrations",
      href: "/settings#integrations",
    });
  }

  // 3) Upgrade nudge (Starter seeing value: alerts in last 7 days)
  if (status.plan === "starter" && status.alerts7d > 0) {
    nudges.push({
      id: "upgrade-autoscan",
      severity: "warning",
      title: "Unlock auto-scans & team alerts",
      body: "You’ve generated alerts recently. Pro adds auto-scans plus Slack/Email routing.",
      ctaText: "Upgrade to Pro",
      href: "/settings#billing",
    });
  }

  // 4) Trial ending (soft)
  if (status.trialDaysLeft <= 3) {
    const when = status.trialDaysLeft <= 0 ? "Trial ended" : `Trial ends in ${status.trialDaysLeft} day(s)`;
    nudges.push({
      id: "trial-ending",
      severity: "error",
      title: when,
      body: "Keep auto-scans and advanced KPIs active by upgrading your plan.",
      ctaText: "Choose a plan",
      href: "/settings#billing",
    });
  }

  return nudges;
}
