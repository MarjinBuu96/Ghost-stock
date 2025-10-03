// src/app/api/shopify/locations/route.js
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies, headers as nextHeaders } from "next/headers";

import { SHOPIFY_API_VERSION, shopifyGraphqlUrl, shopifyRestUrl } from "@/lib/shopifyApi";

function getShopFromRequest(req) {
  try {
    const c = cookies();
    const cookieShop = c.get("shopify_shop")?.value;
    if (cookieShop) return String(cookieShop).toLowerCase();
  } catch {}
  try {
    const h = nextHeaders();
    const hdrShop = h.get("x-shopify-shop-domain");
    if (hdrShop) return String(hdrShop).toLowerCase();
  } catch {}
  try {
    const url = new URL(req.url);
    const hostB64 = url.searchParams.get("host");
    if (hostB64) {
      const decoded = Buffer.from(hostB64, "base64").toString("utf8");
      const m = decoded.match(/\/store[s]?\/([^/?#]+)/i);
      if (m) return `${m[1]}.myshopify.com`.toLowerCase();
    }
  } catch {}
  return null;
}

async function sgql(shop, token, query, variables) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  return resp.json();
}

export async function GET(req) {
  const shop = getShopFromRequest(req);
  if (!shop) return NextResponse.json({ error: "no_shop_in_request" }, { status: 400 });

  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store?.accessToken) return NextResponse.json({ error: "no_store_or_token" }, { status: 400 });

  const query = `
    query ListLocations {
      locations(first: 100) {
        edges {
          node { id name isActive }
        }
      }
    }
  `;

  const json = await sgql(shop, store.accessToken, query, {});
  const edges = json?.data?.locations?.edges ?? [];
  const locations = edges.map((e) => e.node).filter((l) => l?.isActive !== false);

  return NextResponse.json({ locations });
}
