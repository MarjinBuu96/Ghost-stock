import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const SHOP_COOKIE = "shopify_shop";

export async function POST(req) {
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      console.warn("⚠️ Missing session token in Authorization header");
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const decoded = jwt.decode(token);
    const dest = decoded?.dest || "";
    const shop = dest.replace(/^https?:\/\//, "").toLowerCase();

    console.log("🔍 Decoded session token:", { dest, shop });

    if (!shop || !shop.endsWith(".myshopify.com")) {
      console.warn("❌ Invalid shop domain from token:", shop);
      return NextResponse.json({ ok: false, error: "Invalid shop domain" }, { status: 400 });
    }

    const existing = await prisma.store.findUnique({ where: { shop } });

    if (!existing) {
      await prisma.store.create({
        data: {
          shop,
          accessToken: "", // placeholder
          userEmail: shop,
        },
      });
      console.log("🆕 Store created from session token:", shop);
    } else {
      if (!existing.accessToken) {
        await prisma.store.update({
          where: { shop },
          data: { updatedAt: new Date() },
        });
        console.log("🔄 Store updated (no access token yet):", shop);
      } else {
        console.log("✅ Store already exists with access token:", shop);
      }
    }

    const res = NextResponse.json({ ok: true, shop });
    res.cookies.set(SHOP_COOKIE, shop, {
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });

    console.log("🍪 Set shopify_shop cookie:", shop);
    return res;
  } catch (err) {
    console.error("❌ Session route error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
