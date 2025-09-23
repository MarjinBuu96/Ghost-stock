// src/lib/scanRunner.js
import 'server-only';

import { prisma } from './prisma';
import { getInventoryByVariant, getSalesByVariant } from './shopifyRest';
import { computeAlerts } from './alertsEngine';
import { publish } from './kpiBus';
import { computeKpisForUser } from './kpis';
import { hasFeature, FEATURES, normalizePlan } from './entitlements';
import { sendAlertEmail } from './email';

// daily dedupe key; matches @@unique([storeId, uniqueHash]) in Prisma
function makeUniqueHash(a) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${a.sku}|${a.severity}|${day}`;
}

export async function runScanForStore(store) {
  if (!store?.shop || !store?.accessToken) {
    return { ok: false, error: 'store_incomplete', alerts: 0 };
  }

  // 1) Inventory (required)
  let inventory = [];
  try {
    inventory = await getInventoryByVariant(store.shop, store.accessToken);
  } catch (e) {
    return { ok: false, error: `inventory_error:${e?.message || e}`, alerts: 0 };
  }

  // 2) Sales (optional)
  let salesMap = {};
  try {
    salesMap = await getSalesByVariant(store.shop, store.accessToken);
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    const missingScope = msg.includes('401') || msg.includes('403');
    if (!missingScope) {
      return { ok: false, error: `orders_error:${e?.message || e}`, alerts: 0 };
    }
    salesMap = {};
  }

  // 3) Compute alerts
  const alerts = computeAlerts(inventory, salesMap);

  // 4) Upsert alerts with dedupe
  if (alerts.length > 0) {
    await prisma.$transaction(
      alerts.map((a) =>
        prisma.alert.upsert({
          where: {
            storeId_uniqueHash: { storeId: store.id, uniqueHash: makeUniqueHash(a) },
          },
          update: {
            systemQty: a.systemQty,
            expectedMin: a.expectedMin,
            expectedMax: a.expectedMax,
            severity: a.severity,
            status: 'open',
          },
          create: {
            userEmail: store.userEmail, // embedded mode uses shop as userEmail; OK
            storeId: store.id,
            sku: a.sku,
            product: a.product,
            systemQty: a.systemQty,
            expectedMin: a.expectedMin,
            expectedMax: a.expectedMax,
            severity: a.severity,
            status: 'open',
            uniqueHash: makeUniqueHash(a),
          },
        })
      )
    );
  }

  // 4b) Update lastScanAt for this store
  try {
    await prisma.store.update({
      where: { id: store.id },
      data: { lastScanAt: new Date() },
    });
  } catch (e) {
    console.warn('Could not update lastScanAt:', e?.message || e);
  }

  // 5) KPIs + SSE
  try {
    const kpis = await computeKpisForUser(store.userEmail);
    publish(store.userEmail, kpis);
  } catch (e) {
    console.warn('KPI publish failed:', e);
  }

  // 6) Slack (Pro+)
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true, slackWebhookUrl: true },
    });
    const plan = normalizePlan(settings?.plan || 'starter');
    const webhook = settings?.slackWebhookUrl?.trim();

    if (alerts.length > 0 && webhook && hasFeature(plan, FEATURES.SLACK_WEBHOOK)) {
      const top = alerts
        .slice(0, 5)
        .map(
          (a) =>
            `• ${a.sku} (${a.severity}) expected ${a.expectedMin}-${a.expectedMax}, system ${a.systemQty}`
        )
        .join('\n');
      const more = alerts.length > 5 ? `\n…+${alerts.length - 5} more` : '';
      const base =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000';
      const text =
        `⚠️ *Ghost Stock Alerts* for *${store.shop}* (${alerts.length} total)\n` +
        `${top}${more}\n` +
        `Open dashboard: ${base}/dashboard`;

      const resp = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        console.warn('Slack webhook HTTP error:', resp.status, await resp.text().catch(() => ''));
      }
    }
  } catch (e) {
    console.warn('Slack webhook failed:', e);
  }

  // 7) Email (Pro+/Enterprise)
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true, notificationEmail: true },
    });
    const plan = normalizePlan(settings?.plan || 'starter');
    const to = settings?.notificationEmail;

    if (alerts.length > 0 && to && hasFeature(plan, FEATURES.EMAIL_ALERTS)) {
      const subject = `Ghost Stock Alerts — ${store.shop} (${alerts.length})`;
      const top = alerts
        .slice(0, 10)
        .map(
          (a) =>
            `• ${a.sku} (${a.severity}) expected ${a.expectedMin}-${a.expectedMax}, system ${a.systemQty}`
        )
        .join('<br/>');
      const more = alerts.length > 10 ? `<br/>…+${alerts.length - 10} more` : '';
      const base =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000';
      const html =
        `<p>New ghost-stock alerts for <b>${store.shop}</b>:</p><p>${top}${more}</p>` +
        `<p><a href="${base}/dashboard">Open dashboard</a></p>`;
      await sendAlertEmail({ to, subject, html });
    }
  } catch (e) {
    console.warn('Email alert failed:', e);
  }

  return { ok: true, alerts: alerts.length };
}

export async function runAutoScanForEligibleStores() {
  const stores = await prisma.store.findMany({
    select: { id: true, userEmail: true, shop: true, accessToken: true },
  });

  let scanned = 0;
  let skipped = 0;
  let failures = 0;
  const details = [];

  for (const store of stores) {
    // Read plan & gating
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: store.userEmail },
      select: { plan: true },
    });
    const plan = normalizePlan(settings?.plan || 'starter');

    if (!hasFeature(plan, FEATURES.AUTO_SCAN)) {
      skipped++;
      details.push({ shop: store.shop, action: 'skipped', reason: 'no_auto_scan_in_plan' });
      continue;
    }

    const res = await runScanForStore(store);
    if (res.ok) {
      scanned++;
      details.push({ shop: store.shop, action: 'scanned', alerts: res.alerts });
    } else {
      failures++;
      details.push({ shop: store.shop, action: 'failed', error: res.error });
    }
  }

  return { total: stores.length, scanned, skipped, failures, details };
}
