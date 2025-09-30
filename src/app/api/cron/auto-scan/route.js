// src/app/api/cron/auto-scan/route.js
export const runtime = "nodejs";

function isAuthorized(req) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return isVercelCron || (token && token === process.env.CRON_SECRET);
}

async function listProShops() {
  const csv = process.env.PRO_SHOPS_CSV || "";
  return csv.split(",").map(s => s.trim()).filter(Boolean);
}

async function triggerScanForShop(origin, shopDomain) {
  const res = await fetch(`${origin}/api/scan?shop=${encodeURIComponent(shopDomain)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
  });
  let text = "";
  try { text = await res.text(); } catch {}
  return { shop: shopDomain, ok: res.ok, status: res.status, text };
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const origin = new URL(req.url).origin; // ✅ safest origin
  const shops = await listProShops();
  if (shops.length === 0) {
    return new Response(JSON.stringify({ ok: true, ran: 0, note: "No pro shops configured" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const results = [];
  const queue = [...shops];
  const CONCURRENCY = 3;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }).map(async () => {
    while (queue.length) {
      const shop = queue.shift();
      try {
        results.push(await triggerScanForShop(origin, shop));
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
    failed: results.filter(r => !r.ok).map(r => ({ shop: r.shop, status: r.status, text: r.text || r.error })),
  };

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
