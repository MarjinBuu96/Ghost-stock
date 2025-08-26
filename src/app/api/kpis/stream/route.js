export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { subscribe } from "@/lib/kpiBus";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Create an SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // initial ping
      controller.enqueue(encoder.encode(`event: ping\ndata: "ok"\n\n`));

      // subscribe this client to KPI updates for this user
      const unsubscribe = subscribe(userEmail, send);

      // keep-alive (important for proxies)
      const ka = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: "ok"\n\n`));
      }, 25000);

      // close handling
      const close = () => {
        clearInterval(ka);
        unsubscribe();
        try { controller.close(); } catch {}
      };

      // Abort when client disconnects
      // @ts-ignore
      req.signal?.addEventListener("abort", close);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
