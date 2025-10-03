// src/components/UpgradeToProButton.jsx
"use client";
import { useEffect, useState } from "react";
import { getEmbeddedHost, startUpgrade } from "@/lib/billingClient";

export default function UpgradeToProButton({ className = "", onDone }) {
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const isEmbedded = typeof window !== "undefined" && window.top !== window.self;

  useEffect(() => {
    setHost(getEmbeddedHost() || "");
  }, []);

  // Prefer URL ?host=, then cookie, then state
  function resolveHost() {
    try {
      const p = new URLSearchParams(window.location.search);
      const h = p.get("host");
      if (h) return h;
    } catch {}
    const cookieHost =
      (typeof document !== "undefined" &&
        document.cookie.match(/(?:^|;\s*)shopifyHost=([^;]+)/)?.[1]) ||
      "";
    return cookieHost || host || "";
  }

  async function handleClick() {
    try {
      setBusy(true);
      const h = resolveHost();

      // If not embedded, send them to Settings with host preserved
      if (!isEmbedded) {
        const dest = h ? `/settings?host=${encodeURIComponent(h)}#billing` : "/settings#billing";
        window.location.href = dest;
        return;
      }

      // Embedded: kick off upgrade
      const result = await startUpgrade("pro", h);

      // If billingClient returns a URL/object, open it
      if (typeof result === "string") {
        window.open(result, "_blank", "noopener,noreferrer");
      } else if (result && typeof result === "object" && result.confirmationUrl) {
        window.open(result.confirmationUrl, "_blank", "noopener,noreferrer");
      }

      onDone?.();
    } catch (e) {
      console.error(e);
      alert("Could not start Shopify upgrade. Please try again from Settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-60 ${className}`}
    >
      {busy ? "Starting…" : "Upgrade to Pro"}
    </button>
  );
}
