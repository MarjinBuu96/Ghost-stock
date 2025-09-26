"use client";

import useSWR from "swr";
import { useState, useMemo, useEffect } from "react";
import { fetcher } from "@/lib/fetcher";



function Banner({
  tone = "info", // "info" | "warning" | "success" | "upgrade"
  title,
  body,
  children,
}) {
  const styles = {
    info: "bg-blue-900/30 border-blue-700",
    warning: "bg-yellow-900/30 border-yellow-700",
    success: "bg-green-900/30 border-green-700",
    upgrade: "bg-purple-900/30 border-purple-700",
  }[tone];

  return (
    <div className={`mb-3 p-4 rounded border ${styles}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          {title && <p className="font-semibold">{title}</p>}
          {body && <p className="text-sm text-gray-300 mt-0.5">{body}</p>}
        </div>
        {children ? <div className="flex gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Alerts
  const { data, error, isLoading, mutate } = useSWR("/api/alerts", fetcher, { refreshInterval: 0 });
  const [filter, setFilter] = useState("all");
  const [isScanning, setIsScanning] = useState(false);
  const [countingIds, setCountingIds] = useState(() => new Set());

  // Track “first scan done”
  const [hasScanned, setHasScanned] = useState(false);
  useEffect(() => {
    // load persisted flag
    try {
      if (localStorage.getItem("hasScanned") === "1") setHasScanned(true);
    } catch {}
  }, []);
  // If alerts show up (e.g., auto/webhook scan), set the flag
  useEffect(() => {
    if ((data?.alerts?.length ?? 0) > 0 && !hasScanned) {
      setHasScanned(true);
      try { localStorage.setItem("hasScanned", "1"); } catch {}
    }
  }, [data?.alerts?.length, hasScanned]);

  // Connected stores
  const { data: storesData } = useSWR("/api/me/stores", fetcher);
  const stores = storesData?.stores ?? [];
  const hasStore = stores.length > 0;

  // Inventory snapshot (for table at bottom)
  const {
    data: invData,
    error: invErr,
    isLoading: invLoading,
    mutate: invMutate,
  } = useSWR("/api/debug/inventory", fetcher, { refreshInterval: 0 });
  const invRows = invData?.items ?? [];
  const invCount = invData?.count ?? 0;

  // KPIs — poll every 15s
  const {
    data: kpis,
    isLoading: kpisLoading,
    mutate: mutateKpis,
  } = useSWR("/api/kpis", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });

  // User settings (plan, currency, integrations)
  const { data: settingsData, mutate: mutateSettings } = useSWR("/api/settings", fetcher, { refreshInterval: 0 });
  const currency = settingsData?.settings?.currency ?? "USD";
  const plan = String(settingsData?.settings?.plan || "starter").toLowerCase();
  const isStarter = plan === "starter";
  const canUseIntegrations = plan === "pro" || plan === "enterprise";
  const slackConfigured = !!settingsData?.settings?.slackWebhookUrl;
  const emailConfigured = !!settingsData?.settings?.notificationEmail;

  function formatCurrency(n, ccy = currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(n ?? 0);
    } catch {
      return `${ccy} ${(Number(n ?? 0)).toFixed(2)}`;
    }
  }

  const liveCount = kpis?.count ?? (data?.alerts?.length ?? 0);
  const atRiskRevenue = kpis?.atRiskRevenue ?? 0;
  const confidence = kpis?.confidence ?? 0;
  const confidencePretty = `${Math.min(100, Math.max(0, Number(confidence || 0))).toFixed(1)}%`;

  const alerts = useMemo(() => {
    const a = data?.alerts ?? [];
    if (filter === "all") return a;
    if (filter === "high") return a.filter((x) => x.severity === "high");
    if (filter === "med") return a.filter((x) => x.severity === "med");
    return a;
  }, [data, filter]);

  async function resolve(id) {
    const prev = data;
    const next = { alerts: (data?.alerts ?? []).filter((a) => a.id !== id) };
    mutate(next, false);
    const res = await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    if (!res.ok) mutate(prev, false);
    else {
      setCountingIds((prevSet) => {
        const n = new Set(prevSet);
        n.delete(id);
        return n;
      });
      await Promise.all([mutate(), mutateKpis()]);
    }
  }

  async function startCount(id) {
    setCountingIds((prevSet) => new Set(prevSet).add(id));
    try {
      const res = await fetch(`/api/alerts/${id}/start-count`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      await Promise.all([mutate(), mutateKpis()]);
    } catch (e) {
      console.warn("Start Count failed:", e);
      setCountingIds((prevSet) => {
        const n = new Set(prevSet);
        n.delete(id);
        return n;
      });
      alert("Could not start a count right now.");
    }
  }

  async function scan() {
    try {
      setIsScanning(true);
      const res = await fetch("/api/shopify/scan", { method: "POST" });
      if (res.ok) {
        // mark first-scan success
        setHasScanned(true);
        try { localStorage.setItem("hasScanned", "1"); } catch {}
        await Promise.all([mutate(), invMutate(), mutateKpis()]);
        return;
      }
      let payload = {};
      try { payload = await res.json(); } catch {}
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/dashboard";
        return;
      }
      if (payload?.error === "no_store") {
        alert("No Shopify store connected yet. Head to Settings to connect your shop.");
        window.location.href = "/settings";
        return;
      }
      alert("Scan failed. Please try again.");
    } catch (e) {
      console.error(e);
      alert("Network error while scanning.");
    } finally {
      setIsScanning(false);
    }
  }

  async function changeCurrency(newCcy) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: newCcy }),
    });
    await Promise.all([mutateSettings(), mutateKpis()]);
  }

  async function upgradeTo(plan) {
    try {
      const res = await fetch("/api/shopify/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.confirmationUrl) throw new Error(json?.error || "Upgrade failed");
      window.location.href = json.confirmationUrl;
    } catch (e) {
      console.warn(e);
      alert("Could not open the Shopify upgrade page.");
    }
  }

  // Banner logic
  const showRunScanBanner = hasStore && !isScanning && !hasScanned; // ⬅ disappears after first success
  const showFinishAlertsSetup = hasStore && canUseIntegrations && (!slackConfigured || !emailConfigured);
  const showUpgradeProBanner = hasStore && isStarter && (liveCount > 0 || atRiskRevenue > 0);
  const showEmptyStateTips = hasStore && hasScanned && (alerts?.length ?? 0) === 0;

  return (
    <main className="px-6 py-10 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-2">Inventory Health</h2>
      <p className="text-gray-300 mb-6">
        Active ghost-stock alerts based on recent sales velocity vs. system on-hand.
      </p>

      {/* 1) Store connection banner */}
      <div
        className={`mb-3 p-4 rounded border ${
          hasStore ? "bg-gray-800 border-gray-700" : "bg-yellow-900/30 border-yellow-700"
        }`}
      >
        {hasStore ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Store connected</p>
              <p className="text-lg font-semibold">{stores[0].shop}</p>
            </div>
            <a href="/settings" className="text-sm underline hover:text-green-400">Manage</a>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-200">No Shopify store connected</p>
              <p className="text-gray-300">Connect your store to generate real ghost-stock alerts.</p>
            </div>
            <a
              href="/settings"
              className="bg-green-500 hover:bg-green-600 text-black px-4 py-2 rounded font-semibold text-sm"
            >
              Connect Store
            </a>
          </div>
        )}
      </div>

      {/* 2) Lifecycle banners */}
      {hasStore && showRunScanBanner && (
        <Banner
          tone="info"
          title="Run your first scan"
          body="Get fresh alerts based on your current inventory and recent sell-through."
        >
          <button
            onClick={scan}
            disabled={isScanning}
            className={`px-3 py-2 rounded font-semibold ${
              isScanning ? "bg-green-300 text-black cursor-not-allowed" : "bg-green-500 hover:bg-green-600 text-black"
            }`}
          >
            {isScanning ? "Scanning…" : "Run Scan"}
          </button>
        </Banner>
      )}

      {hasStore && showFinishAlertsSetup && (
        <Banner
          tone="success"
          title="Finish alerts setup"
          body={`You're on ${plan}. Connect ${!slackConfigured ? "Slack" : ""}${!slackConfigured && !emailConfigured ? " and " : ""}${!emailConfigured ? "Email" : ""} to receive proactive notifications.`}
        >
          <a
            href="/settings#integrations"
            className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold"
          >
            Go to Integrations
          </a>
        </Banner>
      )}

      {hasStore && showUpgradeProBanner && (
        <Banner
          tone="upgrade"
          title="Save time with Auto-scan + Alerts (Pro)"
          body="Enable daily auto-scans and Slack/Email alerts so you don't miss ghost stock."
        >
          <button
            onClick={() => upgradeTo("pro")}
            className="px-3 py-2 rounded bg-purple-500 hover:bg-purple-600 text-black text-sm font-semibold"
          >
            Upgrade to Pro
          </button>
          <a
            href="/settings#billing"
            className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold"
          >
            Compare plans
          </a>
        </Banner>
      )}

      {showEmptyStateTips && (
        <Banner
          tone="info"
          title="No active alerts right now 🎉"
          body="Great! Here are quick ways to keep things clean:"
        >
          <a href="/settings#integrations" className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold">
            Enable Slack/Email
          </a>
          <button
            onClick={() => upgradeTo("pro")}
            className="px-3 py-2 rounded bg-purple-500 hover:bg-purple-600 text-black text-sm font-semibold"
          >
            Schedule Auto-Scans
          </button>
        </Banner>
      )}

      {/* Filter + Scan + Currency */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 mt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Filter:</span>
          <button
            onClick={() => setFilter("all")}
            className={`text-xs px-2 py-1 rounded ${filter === "all" ? "bg-gray-700" : "bg-gray-800 hover:bg-gray-700"}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("high")}
            className={`text-xs px-2 py-1 rounded ${
              filter === "high" ? "bg-red-700 text-red-100" : "bg-red-700/60 hover:bg-red-700 text-red-100"
            }`}
          >
            High
          </button>
          <button
            onClick={() => setFilter("med")}
            className={`text-xs px-2 py-1 rounded ${
              filter === "med" ? "bg-yellow-700 text-yellow-100" : "bg-yellow-700/60 hover:bg-yellow-700 text-yellow-100"
            }`}
          >
            Med
          </button>
        </div>

        <a
          href="/api/alerts/export"
          className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
          title="Download current alerts as CSV"
        >
          Export CSV
        </a>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Currency:</span>
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className="bg-gray-800 text-sm rounded px-2 py-1"
            >
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="AUD">AUD</option>
              <option value="CAD">CAD</option>
              <option value="NZD">NZD</option>
            </select>
          </div>

          <button
            onClick={scan}
            disabled={isScanning}
            className={`px-4 py-2 rounded font-semibold ${
              isScanning ? "bg-green-300 text-black cursor-not-allowed" : "bg-green-500 hover:bg-green-600 text-black"
            }`}
          >
            {isScanning ? "Scanning…" : "Run Scan"}
          </button>
        </div>
      </div>

      {/* Main content */}
      {(alerts?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* KPIs */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-gray-800 p-5 rounded">
              <p className="text-sm text-gray-400">Suspected Ghost SKUs</p>
              <p className="text-4xl font-extrabold mt-1 text-red-400">{kpisLoading ? "…" : liveCount}</p>
            </div>
            <div className="bg-gray-800 p-5 rounded">
              <p className="text-sm text-gray-400">At-Risk Revenue</p>
              <p className="text-4xl font-extrabold mt-1 text-yellow-300">
                {kpisLoading ? "…" : formatCurrency(atRiskRevenue, currency)}
              </p>
            </div>
            <div className="bg-gray-800 p-5 rounded">
              <p className="text-sm text-gray-400">
                Data Confidence{" "}
                <span
                  className="cursor-help text-gray-400"
                  title="How reliable your alerts are, based on recent sales signal vs. inventory noise."
                >
                  ⓘ
                </span>
              </p>
              <p className="text-4xl font-extrabold mt-1 text-green-400">{kpisLoading ? "…" : confidencePretty}</p>
            </div>
          </aside>

          {/* Alerts table */}
          <section className="lg:col-span-8 space-y-4">
            <div className="overflow-x-auto rounded-lg ring-1 ring-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900/60 text-gray-300">
                  <tr>
                    <th className="text-left px-4 py-2">SKU</th>
                    <th className="text-left px-4 py-2">Product</th>
                    <th className="text-left px-4 py-2">System Qty</th>
                    <th className="text-left px-4 py-2">
                      Expected Qty{" "}
                      <span
                        className="cursor-help text-gray-400"
                        title="Statistical band of what on-hand should be (min–max), given recent sell-through."
                      >
                        ⓘ
                      </span>
                    </th>
                    <th className="text-left px-4 py-2">Risk</th>
                    <th className="text-left px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {error && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-red-400">
                        Failed to load alerts
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    !error &&
                    alerts.map((a) => (
                      <tr key={a.id} className="odd:bg-gray-900/30">
                        <td className="px-4 py-2 font-mono">{a.sku}</td>
                        <td className="px-4 py-2">{a.product}</td>
                        <td className="px-4 py-2">{a.systemQty}</td>
                        <td className="px-4 py-2">
                          {a.expectedMin}–{a.expectedMax}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded ${
                              a.severity === "high" ? "bg-red-700 text-red-100" : "bg-yellow-700 text-yellow-100"
                            }`}
                          >
                            {a.severity === "high" ? "High" : "Med"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => startCount(a.id)}
                              disabled={countingIds.has(a.id)}
                              className={`px-3 py-1 rounded font-semibold ${
                                countingIds.has(a.id)
                                  ? "bg-green-300 text-black cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-500 text-black"
                              }`}
                              title={
                                countingIds.has(a.id)
                                  ? "Counting in progress"
                                  : "Kick off a physical count to fix ghost stock"
                              }
                            >
                              {countingIds.has(a.id) ? "Counting…" : "Start Count"}
                            </button>
                            <button
                              onClick={() => resolve(a.id)}
                              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
                            >
                              Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Insight tiles (placeholders) */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-gray-800 p-4 rounded">
                <p className="text-xs text-gray-400">Root Cause (Top)</p>
                <p className="mt-1 font-medium">Receiving mismatch</p>
                <p className="text-xs text-gray-500">(example)</p>
              </div>
              <div className="bg-gray-800 p-4 rounded">
                <p className="text-xs text-gray-400">Predicted Next Error</p>
                <p className="mt-1 font-medium">Next mismatch in ~3 days</p>
                <p className="text-xs text-gray-500">(example)</p>
              </div>
              <div className="bg-gray-800 p-4 rounded">
                <p className="text-xs text-gray-400">Suggested Action</p>
                <p className="mt-1 font-medium">Cycle count A-isle, bin A12–A16</p>
                <p className="text-xs text-gray-500">(example)</p>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <>
          {/* Empty-state KPIs */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded">
              <p className="text-sm text-gray-400">Suspected Ghost SKUs</p>
              <p className="text-3xl font-bold text-red-400">{kpisLoading ? "…" : liveCount}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded">
              <p className="text-sm text-gray-400">At-Risk Revenue</p>
              <p className="text-3xl font-bold text-yellow-300">
                {kpisLoading ? "…" : formatCurrency(atRiskRevenue, currency)}
              </p>
            </div>
            <div className="bg-gray-800 p-4 rounded">
              <p className="text-sm text-gray-400">
                Data Confidence{" "}
                <span
                  className="cursor-help text-gray-400"
                  title="How reliable your alerts are, based on recent sales signal vs. inventory noise."
                >
                  ⓘ
                </span>
              </p>
              <p className="text-3xl font-bold text-green-400">{kpisLoading ? "…" : `${confidence}%`}</p>
            </div>
          </div>

          {/* Empty-state tips ONLY after a scan */}
          {showEmptyStateTips && (
            <div className="mb-6 p-4 rounded border bg-blue-900/30 border-blue-700">
              <p className="font-semibold">What to do next</p>
              <ul className="list-disc pl-5 text-sm text-blue-100 mt-2 space-y-1">
                <li>Run another scan after a few sales to keep things fresh.</li>
                <li>
                  Enable <a href="/settings#integrations" className="underline">Slack/Email alerts</a> so you don’t miss changes.
                </li>
                <li>Use “Start Count” on suspicious SKUs to confirm on-hand quickly.</li>
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg ring-1 ring-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-900/60 text-gray-300">
                <tr>
                  <th className="text-left px-4 py-2">SKU</th>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-left px-4 py-2">System Qty</th>
                  <th className="text-left px-4 py-2">
                    Expected Qty{" "}
                    <span
                      className="cursor-help text-gray-400"
                      title="Statistical band of what on-hand should be (min–max), given recent sell-through."
                    >
                      ⓘ
                    </span>
                  </th>
                  <th className="text-left px-4 py-2">Risk</th>
                  <th className="text-left px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={6}>
                    No active alerts 🎉
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Inventory Snapshot */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold">Inventory Snapshot</h3>
          <div className="text-sm text-gray-400 flex items-center gap-3">
            <span>
              {invLoading ? "Loading…" : invErr ? "Failed to load" : `${invCount} variants (showing first 50)`}
            </span>
            <button onClick={() => invMutate()} className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700">
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg ring-1 ring-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">SKU / Key</th>
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-left px-4 py-2">System Qty</th>
                <th className="text-left px-4 py-2">Variant ID</th>
                <th className="text-left px-4 py-2">Inventory Item ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {invLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {invErr && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-red-400">
                    Failed to load inventory
                  </td>
                </tr>
              )}
              {!invLoading && !invErr && invRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No variants found
                  </td>
                </tr>
              )}
              {!invLoading &&
                !invErr &&
                invRows.map((r, i) => (
                  <tr key={`${r.variantId}-${i}`} className="odd:bg-gray-900/30">
                    <td className="px-4 py-2 font-mono">{r.sku || r.variantId}</td>
                    <td className="px-4 py-2">{r.product}</td>
                    <td className="px-4 py-2">{typeof r.systemQty === "number" ? r.systemQty : 0}</td>
                    <td className="px-4 py-2">{r.variantId}</td>
                    <td className="px-4 py-2">{r.inventory_item_id}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          Note: System Qty currently uses <code>variant.inventory_quantity</code> (MVP). We’ll switch to multi-location
          <code> inventory_levels</code> next for full accuracy.
        </p>
      </div>
    </main>
  );
}
