"use client";

import useSWR from "swr";
import { useState } from "react";

const fetcher = async (u) => {
  const r = await fetch(u);
  let json = {};
  try { json = await r.json(); } catch {}
  // Don't crash the UI—return an object that includes status so we can render a nice message
  if (!r.ok) return { __error: true, status: r.status, body: json };
  return json;
};

export default function SettingsPage() {
  // Shopify connect form
  const [shop, setShop] = useState("");
  function startInstall(e) {
    e.preventDefault();
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
  }

  // Settings (plan + currency)
  const { data: settingsResp, isLoading, mutate } = useSWR("/api/settings", fetcher);
  const hasApiError = settingsResp?.__error;
  const apiStatus = settingsResp?.status;
  const apiBody = settingsResp?.body;

  const settings = settingsResp?.settings;
  const plan = settings?.plan ?? "free";
  const currency = settings?.currency ?? "USD";

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function changeCurrency(newCcy) {
    try {
      setSaving(true);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: newCcy }),
      });
      if (!res.ok) throw new Error("Failed to save currency");
      await mutate();
      notify("Currency updated");
    } catch (e) {
      console.error(e);
      notify("Could not update currency");
    } finally {
      setSaving(false);
    }
  }

  async function goCheckout(priceId) {
    try {
      setBusy(true);
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.error || "Checkout failed");
      window.location.href = json.url;
    } catch (e) {
      console.error(e);
      notify("Checkout failed");
      setBusy(false);
    }
  }

  async function goPortal() {
    try {
      setBusy(true);
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.error || "Portal failed");
      window.location.href = json.url;
    } catch (e) {
      console.error(e);
      notify("Could not open billing portal");
      setBusy(false);
    }
  }

  // Supply your Stripe price IDs via NEXT_PUBLIC_ envs or temporarily hardcode here
  const PRICE_STARTER = process.env.NEXT_PUBLIC_PRICE_STARTER || "price_starter_replace_me";
  const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO || "price_pro_replace_me";

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto text-white">
      <h2 className="text-3xl font-bold mb-6">Settings</h2>

      {toast && (
        <div className="mb-4 rounded bg-gray-800 px-4 py-2 text-sm">{toast}</div>
      )}

      {/* Clear error banners that never hide the rest of the page */}
      {hasApiError && apiStatus === 401 && (
        <div className="mb-6 rounded border border-yellow-700 bg-yellow-900/30 p-4">
          <p className="text-yellow-200">You’re not signed in.</p>
          <a href="/login?callbackUrl=/settings" className="underline text-yellow-100">
            Sign in to manage your settings →
          </a>
        </div>
      )}

      {hasApiError && apiStatus === 405 && (
        <div className="mb-6 rounded border border-red-700 bg-red-900/30 p-4">
          <p className="text-red-200 font-semibold">/api/settings returned 405 (Method Not Allowed).</p>
          <p className="text-red-200 text-sm mt-1">
            Make sure you have <code>src/app/api/settings/route.js</code> exporting <code>GET</code> and <code>POST</code>.
          </p>
          <pre className="text-xs text-red-200/80 overflow-auto mt-2">
{`export async function GET() { /* ... */ }
export async function POST(req) { /* ... */ }`}
          </pre>
        </div>
      )}

      {hasApiError && apiStatus !== 401 && apiStatus !== 405 && (
        <div className="mb-6 rounded border border-red-700 bg-red-900/30 p-4">
          <p className="text-red-200 font-semibold">Could not load settings</p>
          <pre className="text-xs text-red-200/80 overflow-auto mt-2">
            {JSON.stringify({ status: apiStatus, body: apiBody }, null, 2)}
          </pre>
        </div>
      )}

      {/* Shopify connection */}
      <section className="bg-gray-800 p-6 rounded space-y-4 mb-8 border border-gray-700">
        <h3 className="text-xl font-semibold">Shopify</h3>
        <p className="text-sm text-gray-400">
          Connect your Shopify store to enable live scans and alerts.
        </p>
        <form onSubmit={startInstall} className="space-y-3">
          <label className="block text-sm" htmlFor="shop-input">
            Shop domain (e.g. <span className="opacity-80">my-store.myshopify.com</span>)
          </label>
          <input
            id="shop-input"
            className="w-full px-3 py-2 rounded text-black"
            placeholder="your-shop.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            required
          />
          <button className="bg-green-500 hover:bg-green-600 text-black font-semibold px-4 py-2 rounded">
            Connect Shopify Store
          </button>
        </form>
      </section>

      {/* Subscription */}
      <section className="mb-8 rounded border border-gray-700 bg-gray-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Subscription</h3>
            <p className="text-gray-400 text-sm mt-1">
              Current plan:{" "}
              <span className="font-medium uppercase">
                {isLoading ? "…" : plan}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => goCheckout(PRICE_STARTER)}
              disabled={busy}
              className="rounded bg-emerald-500 hover:bg-emerald-600 text-black px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Upgrade to Starter
            </button>
            <button
              onClick={() => goCheckout(PRICE_PRO)}
              disabled={busy}
              className="rounded bg-indigo-500 hover:bg-indigo-600 text-black px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Upgrade to Pro
            </button>
            <button
              onClick={goPortal}
              disabled={busy}
              className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Manage Billing
            </button>
          </div>
        </div>

        <ul className="mt-4 text-sm text-gray-300 list-disc pl-5 space-y-1">
          <li><span className="font-medium">Starter:</span> Email alerts, manual scans, dashboard KPIs.</li>
          <li><span className="font-medium">Pro:</span> Slack/Teams alerts, auto-scans, webhooks, export.</li>
        </ul>
      </section>

      {/* Preferences (Currency) */}
      <section className="rounded border border-gray-700 bg-gray-900 p-5">
        <h3 className="text-xl font-semibold">Preferences</h3>
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="currency" className="text-sm text-gray-400 w-28">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => changeCurrency(e.target.value)}
            disabled={isLoading || saving || hasApiError}
            className="bg-gray-800 rounded px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
            <option value="NZD">NZD</option>
          </select>
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Affects how amounts are displayed (e.g., at-risk revenue). We can enable FX conversion later.
        </p>
      </section>

      {/* Debug */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-gray-400">Debug</summary>
        <pre className="mt-2 text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-auto">
{JSON.stringify(
  {
    isLoading,
    hasApiError,
    apiStatus,
    apiBody,
    settings,
  },
  null,
  2
)}
        </pre>
      </details>
    </main>
  );
}
