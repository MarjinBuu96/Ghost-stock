// src/app/api/cron/auto-scan/route.js

export const runtime = "nodejs"; // default is fine; explicit for clarity

function isAuthorized(req) {
  // Allow from Vercel Cron OR a manual call with Bearer CRON_SECRET.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return isVercelCron || (token && token === process.env.CRON_SECRET);
}

// 👉 Replace this with your DB query when ready.
async function listProShops() {
  // If you already have a "shops" table, do something like:
  // return db.select("*").from("shops").whereIn("plan", ["pro", "enterprise"]).andWhere({ auto_scan: true });
  const csv = process.env.PRO_SHOPS_CSV || "";
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function triggerScanForShop(shopDomain) {
  // We call the existing scan path in "internal mode" with our CRON_SECRET.
  // Your /api/scan route will get a tiny additive patch to allow this.
  const res = await fetch(`${process.env.APP_URL || ""}/api/scan?shop=${encodeURIComponent(shopDomain)}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.CRON_SECRET || ""}`
    }
  });
  return { shop: shopDomain, ok: res.ok, status: res.status, text: await res.text().catch(() => "") };
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shops = await listProShops();
  if (shops.length === 0) {
    return new Response(JSON.stringify({ ok: true, ran: 0, note: "No pro shops configured" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  // Run with small concurrency to be gentle
  const results = [];
  const queue = [...shops];
  const CONCURRENCY = 3;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }).map(async () => {
    while (queue.length) {
      const shop = queue.shift();
      try {
        results.push(await triggerScanForShop(shop));
      } catch (e) {
        results.push({ shop, ok: false, error: String(e) });
      }
    }
  });

  await Promise.all(workers);

  const summary = {
    ok: true,
    ran: shops.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).map(r => ({ shop: r.shop, status: r.status, text: r.text || r.error }))
  };

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
