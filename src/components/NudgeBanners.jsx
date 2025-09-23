// src/components/NudgeBanners.jsx
"use client";

import useSWR from "swr";
import { useState, useEffect } from "react";

const fetcher = async (u) => {
  const r = await fetch(u, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};

function Nudge({ nudge, onDismiss }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleAction() {
    if (!nudge?.action) return;
    try {
      setSubmitting(true);
      const res = await fetch(nudge.action.url, { method: nudge.action.type || "POST" });
      if (!res.ok) throw new Error();
      // After action (e.g., scan) we refresh the page data
      window.location.reload();
    } catch {
      alert("Action failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className={`rounded border p-3 mb-3 ${nudge.severity === "error" ? "border-red-600 bg-red-900/20" :
      nudge.severity === "warning" ? "border-yellow-600 bg-yellow-900/20" :
      "border-blue-600 bg-blue-900/20"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{nudge.title}</div>
          <div className="text-sm text-gray-200 mt-1">{nudge.body}</div>
          <div className="mt-2 flex gap-2">
            {nudge.href && (
              <a href={nudge.href} className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600">
                {nudge.ctaText || "Open"}
              </a>
            )}
            {nudge.action && (
              <button
                onClick={handleAction}
                disabled={submitting}
                className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-60"
              >
                {submitting ? "Working…" : (nudge.ctaText || "Do it")}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-300 hover:text-white text-sm"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function NudgeBanners() {
  const { data } = useSWR("/api/lifecycle/status", fetcher, { refreshInterval: 60_000 });
  const nudges = data?.nudges || [];

  // simple localStorage "dismiss until next reload"
  const [hidden, setHidden] = useState({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nudge_hidden");
      if (raw) setHidden(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("nudge_hidden", JSON.stringify(hidden));
    } catch {}
  }, [hidden]);

  if (!nudges.length) return null;

  return (
    <div className="mb-4">
      {nudges.filter(n => !hidden[n.id]).map(n => (
        <Nudge key={n.id} nudge={n} onDismiss={() => setHidden({ ...hidden, [n.id]: true })} />
      ))}
    </div>
  );
}
