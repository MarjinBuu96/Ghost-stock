// src/app/api/shopify/locations/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { shopifyGraphqlUrl } from "@/lib/shopifyApi";

const QUERY = `
  query Locations($first: Int!, $after: String) {
    locations(first: $first, after: $after) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node { id name legacy }
      }
    }
  }
`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findFirst({
    where: { userEmail: session.user.email },
  });

  if (!store?.shop || !store?.accessToken) {
    return NextResponse.json({ error: "no_store" }, { status: 400 });
  }

  const out = [];
  let after = null;
  let hasNext = true;

  while (hasNext) {
    const resp = await fetch(shopifyGraphqlUrl(store.shop), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": store.accessToken,
      },
      body: JSON.stringify({ query: QUERY, variables: { first: 100, after } }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.errors) {
      return NextResponse.json(
        { error: "shopify_error", details: json?.errors || json },
        { status: resp.status || 500 }
      );
    }

    const edges = json?.data?.locations?.edges ?? [];
    for (const { node } of edges) {
      out.push({ id: node.id, name: node.name });
    }

    hasNext = !!json?.data?.locations?.pageInfo?.hasNextPage;
    after = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
  }

  return NextResponse.json({ locations: out });
}
