"use client";
import { useEffect, useState } from "react";
import { getEmbeddedHost, startUpgrade } from "@/lib/billingClient";

export default function UpgradeToProButton({ className = "", onDone }) {
  const [host, setHost] = useState(null);
  const [busy, setBusy] = useState(false);
  const isEmbedded = typeof window !== "undefined" && window.top !== window.self;

  useEffect(() => {
    setHost(getEmbeddedHost());
  }, []);

  async function handleClick() {
    try {
      setBusy(true);
      if (!isEmbedded) {
        // If not embedded, send to Settings (or your install flow).
        window.location.href = "/settings";
        return;
      }
      await startUpgrade("pro", host);
      if (onDone) onDone();
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
