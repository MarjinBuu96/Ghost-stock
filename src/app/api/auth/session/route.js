import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db"; // adjust path if needed

export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const decoded = jwt.decode(token);
  const shop = decoded?.dest?.replace(/^https?:\/\//, "");

  if (!shop) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  await prisma.store.upsert({
    where: { shop },
    update: { accessToken: token },
    create: { shop, accessToken: token },
  });

  return NextResponse.json({ ok: true, shop });
}
