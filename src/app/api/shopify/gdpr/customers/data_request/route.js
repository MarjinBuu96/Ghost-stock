// src/app/api/shopify/gdpr/customers/data_request/route.js
export const runtime = "nodejs";
import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ ok: true }); }
