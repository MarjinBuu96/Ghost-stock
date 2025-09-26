"use client";

import { useEffect } from "react";

export const dynamic = "force-static";

export default function ExitIframe() {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const target = p.get("target") || "/";
    if (window.top === window.self) {
      window.location.href = target;
    } else {
      window.top.location.href = target;
    }
  }, []);

  return (
    <div>
      <p>Redirecting...</p>
    </div>
  );
}
