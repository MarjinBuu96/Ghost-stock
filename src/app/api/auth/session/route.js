// src/app/api/auth/session/route.js
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma"; // <- your existing prisma helper

const SHOP_COOKIE = "shopify_shop";

export async function POST(req) {
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    // App Bridge session token: we just decode (no secret needed) to read `dest`
    const decoded = jwt.decode(token);
    const dest = decoded?.dest || "";
    const shop = dest.replace(/^https?:\/\//, "").toLowerCase();
    if (!shop || !shop.endsWith(".myshopify.com")) {
      return NextResponse.json({ ok: false, error: "Invalid shop domain" }, { status: 400 });
    }

    // IMPORTANT: Do NOT overwrite the real OAuth Admin token.
    // We only ensure a Store row exists (create without accessToken) and set the cookie.
    const existing = await prisma.store.findUnique({ where: { shop } });
    if (!existing) {
      await prisma.store.create({
        data: {
          shop,
          accessToken: "",            // real token comes from the OAuth callback route
          userEmail: shop,            // placeholder to satisfy schema
        },
      });
    } else {
      // optional: mark last seen
      await prisma.store.update({
        where: { shop },
        data: { updatedAt: new Date() },
      });
    }

    const res = NextResponse.json({ ok: true, shop });
    res.cookies.set(SHOP_COOKIE, shop, {
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    return res;
  } catch (err) {
    console.error("Session route error:", err);
    return NextResponse.json({ ok: false, error: "Server error", details: err?.message || String(err) }, { status: 500 });
  }
}
