"use client";

import useSWR from "swr";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@/utils/getSessionToken";
// (optional) if you still want to keep your base fetcher import, you can, but we don't use it here
// import { fetcher as baseFetcher } from "@/lib/fetcher";

function Banner({ tone = "info", title, body, children }) {
  const styles =
    {
      info: "bg-blue-900/30 border-blue-700",
      warning: "bg-yellow-900/30 border-yellow-700",
      success: "bg-green-900/30 border-green-700",
      upgrade: "bg-purple-900/30 border-purple-700",
    }[tone] || "bg-blue-900/30 border-blue-700";

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
  // ---- Shopify App Bridge + Session Token (JS) ----
  const searchParams = useSearchParams();
  const host = searchParams.get("host") || "";
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY; // <-- no "!"
  const [token, setToken] = useState(null); // <-- no generic

  useEffect(() => {
    if (!apiKey || !host) return;

    let mounted = true;
    const app = createApp({ apiKey, host, forceRedirect: true });

    async function refresh() {
      try {
        const t = await getSessionToken(app);
        if (mounted) setToken(t);
      } catch (e) {
        console.error("Failed to get session token", e);
      }
    }

    // initial + refresh on focus + periodic (tokens are short-lived)
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refresh, 50_000);

    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [apiKey, host]);

  // fetch wrapper that adds Authorization when we have a token
  const authFetch = useCallback(
    (input, init = {}) => { // <-- no parameter types
      const headers = new Headers(init.headers || {});
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [token]
  );

  // SWR fetcher that adds the token
  const swrFetcher = useCallback(
    async (url) => {
      const res = await authFetch(url);
      if (!res.ok) {
        let info = null;
        try { info = await res.json(); } catch {}
        const err = new Error(info?.error || "Request failed");
        err.status = res.status;
        err.info = info;
        throw err;
      }
      return res.json();
    },
    [authFetch]
  );

  // ---- Alerts ----
  const { data, error, isLoading, mutate } = useSWR("/api/alerts", swrFetcher, { refreshInterval: 0 });
  const [filter, setFilter] = useState("all");
  const [isScanning, setIsScanning] = useState(false);
  const [countingIds, setCountingIds] = useState(() => new Set());

  // Track “first scan done”
  const [hasScanned, setHasScanned] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("hasScanned") === "1") setHasScanned(true);
    } catch {}
  }, []);
  useEffect(() => {
    if ((data?.alerts?.length || 0) > 0 && !hasScanned) {
      setHasScanned(true);
      try { localStorage.setItem("hasScanned", "1"); } catch {}
    }
  }, [data?.alerts?.length, hasScanned]);

  // Connected stores
  const { data: storesData } = useSWR("/api/me/stores", swrFetcher);
  const stores = storesData?.stores || [];
  const hasStore = stores.length > 0;

  // Inventory snapshot
  const {
    data: invData,
    error: invErr,
    isLoading: invLoading,
    mutate: invMutate,
  } = useSWR("/api/debug/inventory", swrFetcher, { refreshInterval: 0 });
  const invRows = invData?.items || [];
  const invCount = invData?.count || 0;

  // KPIs — poll every 15s
  const {
    data: kpis,
    isLoading: kpisLoading,
    mutate: mutateKpis,
  } = useSWR("/api/kpis", swrFetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });

  // User settings
  const { data: settingsData, mutate: mutateSettings } = useSWR("/api/settings", swrFetcher, { refreshInterval: 0 });
  const currency = (settingsData?.settings?.currency) || "USD";
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
    const a = data?.alerts || [];
    if (filter === "all") return a;
    if (filter === "high") return a.filter((x) => x.severity === "high");
    if (filter === "med") return a.filter((x) => x.severity === "med");
    return a;
  }, [data, filter]);

  // ---- Helpers that call your API (token-aware) ----
  const postJSON = useCallback(
    (url, body) =>
      authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    [authFetch]
  );

  async function resolve(id) {
    const prev = data;
    const next = { alerts: (data?.alerts || []).filter((a) => a.id !== id) };
    mutate(next, false);
    const res = await postJSON(`/api/alerts/${id}/resolve`);
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
      const res = await postJSON(`/api/alerts/${id}/start-count`);
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
      const res = await postJSON("/api/shopify/scan");
      if (res.ok) {
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
    await postJSON("/api/settings", { currency: newCcy });
    await Promise.all([mutateSettings(), mutateKpis()]);
  }

  async function upgradeTo(planName) {
    try {
      const res = await postJSON("/api/shopify/billing/upgrade", { plan: planName });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.confirmationUrl) throw new Error(json?.error || "Upgrade failed");
      window.location.href = json.confirmationUrl;
    } catch (e) {
      console.warn(e);
      alert("Could not open the Shopify upgrade page.");
    }
  }

  // ---- Banners ----
  const showRunScanBanner = hasStore && !isScanning && !hasScanned;
  const showFinishAlertsSetup = hasStore && canUseIntegrations && (!slackConfigured || !emailConfigured);
  const showUpgradeProBanner = hasStore && isStarter && (liveCount > 0 || atRiskRevenue > 0);
  const showEmptyStateTips = hasStore && hasScanned && (alerts?.length || 0) === 0;

  return (
    <main className="px-6 py-10 max-w-6xl mx-auto">
      {/* ...rest of your JSX unchanged... */}
    </main>
  );
}
