"use client";

import useSWR from "swr";
import { useState, useMemo } from "react";

const fetcher = (u) => fetch(u).then((r) => r.json());

export default function Dashboard() {
  // Alerts
  const { data, error, isLoading, mutate } = useSWR("/api/alerts", fetcher, { refreshInterval: 0 });
  const [filter, setFilter] = useState("all");
  const [isScanning, setIsScanning] = useState(false);

  // Connected stores
  const { data: storesData } = useSWR("/api/me/stores", fetcher);
  const stores = storesData?.stores ?? [];
  const hasStore = stores.length > 0;

  // Live inventory snapshot (from Shopify)
  const {
    data: invData,
    error: invErr,
    isLoading: invLoading,
    mutate: invMutate,
  } = useSWR("/api/debug/inventory", fetcher, { refreshInterval: 0 });
  const invRows = invData?.items ?? [];
  const invCount = invData?.count ?? 0;

  // Live KPIs (count, at-risk revenue, confidence)
  const {
    data: kpis,
    isLoading: kpisLoading,
    mutate: mutateKpis,
  } = useSWR("/api/kpis", fetcher, { refreshInterval: 0 });

  // User settings (currency)
  const { data: settingsData, mutate: mutateSettings } = useSWR("/api/settings", fetcher, { refreshInterval: 0 });
  const currency = settingsData?.settings?.currency ?? "USD";

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
      await Promise.all([mutate(), mutateKpis()]); // revalidate alerts + KPIs
    }
  }

  async function scan() {
    try {
      setIsScanning(true);
      const res = await fetch("/api/shopify/scan", { method: "POST" });
      if (res.ok) {
        await Promise.all([mutate(), invMutate(), mutateKpis()]); // refresh alerts + inventory + KPIs
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

  return (
    <main className="px-6 py-10 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-2">Inventory Health</h2>
      <p className="text-gray-300 mb-6">
        Active ghost-stock alerts based on recent sales velocity vs. system on-hand.
      </p>

      {/* Store connection banner */}
      <div className={`mb-6 p-4 rounded border ${hasStore ? "bg-gray-800 border-gray-700" : "bg-yellow-900/30 border-yellow-700"}`}>
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
            <a href="/settings" className="bg-green-500 hover:bg-green-600 text-black px-4 py-2 rounded font-semibold text-sm">
              Connect Store
            </a>
          </div>
        )}
      </div>

      {/* Filter + Scan + Currency */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Filter:</span>
          <button onClick={() => setFilter("all")} className={`text-xs px-2 py-1 rounded ${filter==="all" ? "bg-gray-700" : "bg-gray-800 hover:bg-gray-700"}`}>All</button>
          <button onClick={() => setFilter("high")} className={`text-xs px-2 py-1 rounded ${filter==="high" ? "bg-red-700 text-red-100" : "bg-red-700/60 hover:bg-red-700 text-red-100"}`}>High</button>
          <button onClick={() => setFilter("med")} className={`text-xs px-2 py-1 rounded ${filter==="med" ? "bg-yellow-700 text-yellow-100" : "bg-yellow-700/60 hover:bg-yellow-700 text-yellow-100"}`}>Med</button>
        </div>

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
            className={`px-4 py-2 rounded font-semibold ${isScanning ? "bg-green-300 text-black cursor-not-allowed" : "bg-green-500 hover:bg-green-600 text-black"}`}
          >
            {isScanning ? "Scanning…" : "Run Scan"}
          </button>
        </div>
      </div>

      {/* KPIs (live, formatted) */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded">
          <p className="text-sm text-gray-400">Suspected Ghost SKUs</p>
          <p className="text-3xl font-bold text-red-400">
            {kpisLoading ? "…" : liveCount}
          </p>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <p className="text-sm text-gray-400">At-Risk Revenue</p>
          <p className="text-3xl font-bold text-yellow-300">
            {kpisLoading ? "…" : formatCurrency(atRiskRevenue, currency)}
          </p>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <p className="text-sm text-gray-400">Data Confidence</p>
          <p className="text-3xl font-bold text-green-400">
            {kpisLoading ? "…" : `${confidence}%`}
          </p>
        </div>
      </div>

      {/* Alerts table */}
      <div className="overflow-x-auto rounded-lg ring-1 ring-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-900/60 text-gray-300">
            <tr>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-left px-4 py-2">System Qty</th>
              <th className="text-left px-4 py-2">Expected Qty</th>
              <th className="text-left px-4 py-2">Risk</th>
              <th className="text-left px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-red-400">Failed to load alerts</td></tr>
            )}
            {!isLoading && !error && alerts.map((a) => (
              <tr key={a.id} className="odd:bg-gray-900/30">
                <td className="px-4 py-2 font-mono">{a.sku}</td>
                <td className="px-4 py-2">{a.product}</td>
                <td className="px-4 py-2">{a.systemQty}</td>
                <td className="px-4 py-2">{a.expectedMin}–{a.expectedMax}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded ${a.severity==="high" ? "bg-red-700 text-red-100" : "bg-yellow-700 text-yellow-100"}`}>
                    {a.severity === "high" ? "High" : "Med"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => resolve(a.id)} className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-black">
                    Resolve
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && !error && alerts.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={6}>No active alerts 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
              {invLoading && (<tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>)}
              {invErr && (<tr><td colSpan={5} className="px-4 py-6 text-center text-red-400">Failed to load inventory</td></tr>)}
              {!invLoading && !invErr && invRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No variants found</td></tr>
              )}
              {!invLoading && !invErr && invRows.map((r, i) => (
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
