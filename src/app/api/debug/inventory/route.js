export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveStore } from "@/lib/getActiveStore";
import { shopifyGraphql } from "@/lib/shopifyGraphql";

export async function GET(req) {
  try {
    const store = await getActiveStore(req);

    if (!store || !store.shop || !store.accessToken) {
      console.warn("❌ Missing store or access token");
      return NextResponse.json({ items: [], count: 0, error: "missing_store_or_token" });
    }

    console.log("🔑 Using access token:", store.accessToken);

    // 🔍 Validate token with lightweight GraphQL query
    const pingQuery = `{ shop { name } }`;
    const pingRes = await shopifyGraphql(store.shop, store.accessToken, pingQuery);

    if (!pingRes?.shop?.name) {
      console.warn("debug/token-check failed:", pingRes?.errors || "no shop name");
      return NextResponse.json({ items: [], count: 0, error: "invalid_token" });
    }

    // ✅ Token is valid, fetch inventory snapshot via GraphQL
    const inventoryQuery = `
      {
        products(first: 50) {
          edges {
            node {
              id
              title
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    inventoryQuantity
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const inventoryRes = await shopifyGraphql(store.shop, store.accessToken, inventoryQuery);

    if (!inventoryRes?.products?.edges) {
      console.warn("debug/inventory fetch failed:", inventoryRes?.errors || "no products");
      return NextResponse.json({ items: [], count: 0, error: "inventory_fetch_failed" });
    }

    const items = inventoryRes.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      variants: node.variants.edges.map(({ node: variant }) => ({
        id: variant.id,
        title: variant.title,
        quantity: variant.inventoryQuantity,
        inventoryItemId: variant.inventoryItem?.id || null,
      })),
    }));

    return NextResponse.json({
      items,
      count: items.length,
    });
  } catch (e) {
    console.warn("debug/inventory error:", e?.message || e);
    return NextResponse.json({ items: [], count: 0, error: "inventory_fetch_failed" });
  }
}
