// src/app/settings/page.js
"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { fetcher } from "@/lib/fetcher";

export default function SettingsPage() {
  // --- App Bridge host detection (URL first, cookie fallback) ---
  const [host, setHost] = useState(null);
  const isEmbedded = !!host;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlHost = params.get("host");
    const cookieHost =
      document.cookie.match(/(?:^|;\s*)shopifyHost=([^;]+)/)?.[1] || null;
    const h = urlHost || cookieHost || null;
    setHost(h);

    // Persist host so deep-links keep working after navigation
    if (urlHost) {
      document.cookie = `shopifyHost=${urlHost}; path=/; SameSite=None; Secure`;
    }
  }, []);
  // ---------------------------------------------------------------

  // Shopify connect form (only shown when NOT embedded)
  const [shop, setShop] = useState("");
  const startInstall = (e) => {
    e.preventDefault();
    if (!shop) return;
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(
      shop
    )}`;
  };

  // Load settings
  const { data, error, isLoading, mutate } = useSWR("/api/settings", fetcher);
  const settings = data?.settings || {};

  // ==== Plans: support monthly + annual ====
  const planRaw = String(settings?.plan || "starter").toLowerCase();
  const allowedPlans = ["starter", "starter_annual", "pro", "pro_annual"];
  const normalizedPlan = allowedPlans.includes(planRaw) ? planRaw : "starter";

  const isStarter = normalizedPlan.startsWith("starter");
  const isPro = normalizedPlan.startsWith("pro");
  const canUseIntegrations = isPro;

  const prettyPlan = (p) => {
    switch (p) {
      case "starter":
        return "Starter (Monthly)";
      case "starter_annual":
        return "Starter (Annual)";
      case "pro":
        return "Pro (Monthly)";
      case "pro_annual":
        return "Pro (Annual)";
      default:
        return String(p).toUpperCase();
    }
  };

  // ---------- NEW: Inventory prefs (threshold + multi-location) ----------
  // Server values (with fallbacks)
  const serverThreshold = Number(settings?.lowStockThreshold ?? 5);
  const serverUseMultiLoc = !!settings?.useMultiLocation;
  const serverLocIds = Array.isArray(settings?.locationIds) ? settings.locationIds : [];

  // Local UI state
  const [threshold, setThreshold] = useState(serverThreshold);
  const [multiLoc, setMultiLoc] = useState(serverUseMultiLoc);
  const [locIds, setLocIds] = useState(serverLocIds);

  // Keep local state in sync when settings refresh
  useEffect(() => {
    setThreshold(serverThreshold);
    setMultiLoc(serverUseMultiLoc);
    setLocIds(serverLocIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverThreshold, serverUseMultiLoc, settings?.locationIds?.length]);

  // Load Shopify locations ONLY for Pro (and when we have host)
  const { data: locData } = useSWR(
    isPro && host ? `/api/shopify/locations?host=${encodeURIComponent(host)}` : null,
    fetcher
  );
  const locations = locData?.locations ?? [];

  async function saveInventoryPrefs() {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lowStockThreshold: Number.isFinite(Number(threshold))
            ? Math.max(0, Math.floor(Number(threshold)))
            : 0,
          useMultiLocation: !!multiLoc,
          locationIds: Array.isArray(locIds) ? locIds : [],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      await mutate();
      notify("Inventory preferences saved");
    } catch {
      notify("Could not save inventory preferences");
    }
  }
  // ----------------------------------------------------------------------

  // Form state
  const [slackUrl, setSlackUrl] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [currencySaving, setCurrencySaving] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [toast, setToast] = useState("");

  // Hydrate form fields when settings load
  useEffect(() => {
    setSlackUrl(settings?.slackWebhookUrl || "");
    setNotificationEmail(settings?.notificationEmail || "");
  }, [settings?.slackWebhookUrl, settings?.notificationEmail]);

  // Handle Shopify billing return URL params (optional)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chargeId = params.get("charge_id");
    const upgraded = params.get("upgraded");
    const billingError = params.get("billing");

    if (chargeId) {
      fetch(`/api/shopify/billing/confirm?charge_id=${chargeId}`, {
        method: "GET",
      })
        .then(() => {
          mutate(); // Refresh settings
          window.history.replaceState({}, "", window.location.pathname); // Clean URL
        })
        .catch((err) => console.error("Billing confirm failed:", err));
    }

    if (upgraded) notify("Your subscription has been updated 🎉");
    if (billingError) notify("Billing error: " + billingError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = settings?.currency || "GBP";

  function notify(msg) {
    setToast(msg);
    clearTimeout(notify._t);
    notify._t = setTimeout(() => setToast(""), 3000);
  }

  async function changeCurrency(newCcy) {
    try {
      setCurrencySaving(true);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: newCcy }),
      });
      if (!res.ok) throw new Error("Failed");
      await mutate();
      notify("Currency updated");
    } catch {
      notify("Could not update currency");
    } finally {
      setCurrencySaving(false);
    }
  }

  async function saveSlack() {
    try {
      setSaveBusy(true);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackWebhookUrl: slackUrl }),
      });
      if (!res.ok) throw new Error("Failed");
      await mutate();
      notify(slackUrl ? "Slack webhook saved" : "Slack webhook cleared");
    } catch {
      notify("Could not save Slack webhook");
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveEmail() {
    try {
      setSaveBusy(true);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationEmail }),
      });
      if (!res.ok) throw new Error("Failed");
      await mutate();
      notify(
        notificationEmail ? "Notification email saved" : "Notification email cleared"
      );
    } catch {
      notify("Could not save notification email");
    } finally {
      setSaveBusy(false);
    }
  }

  // ==== Shopify Billing actions (supports 4 plan keys) ====
  async function goShopifyUpgrade(plan) {
    try {
      setBillingBusy(true);
      const safePlan = allowedPlans.includes(plan) ? plan : "starter";

      const res = await fetch(
        `/api/shopify/billing/upgrade?host=${host || ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: safePlan }),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.confirmationUrl)
        throw new Error(json?.error || "Upgrade failed");

      // Open Shopify billing confirmation outside iframe
      window.open(json.confirmationUrl, "_blank", "noopener,noreferrer");
    } catch {
      notify("Could not start Shopify upgrade");
    } finally {
      setBillingBusy(false);
    }
  }

  const showUpgradeToStarter = !normalizedPlan.startsWith("starter");
  const showUpgradeToPro = !normalizedPlan.startsWith("pro");

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto text-white">
      <h2 className="text-3xl font-bold mb-6">Settings</h2>

      {toast && (
        <div className="mb-4 rounded bg-gray-800 px-4 py-2 text-sm">{toast}</div>
      )}

      {error && (
        <div className="mb-6 rounded border border-red-700 bg-red-900/30 p-4">
          <p className="text-red-200 font-semibold">Could not load settings</p>
          <p className="text-xs text-red-200/80 mt-2">{String(error.message)}</p>
        </div>
      )}

      {/* Shopify connection — HIDDEN when embedded (host present) */}
      {!isEmbedded && (
        <section className="bg-gray-800 p-6 rounded space-y-4 mb-8 border border-gray-700">
          <h3 className="text-xl font-semibold">Shopify</h3>
          <p className="text-sm text-gray-400">
            Connect your Shopify store to enable live scans and alerts.
          </p>
          <form onSubmit={startInstall} className="space-y-3">
            <label className="block text-sm" htmlFor="shop-input">
              Shop domain (e.g.{" "}
              <span className="opacity-80">my-store.myshopify.com</span>)
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
      )}

      {/* Billing via Shopify */}
      <section
        id="billing"
        className="mb-8 rounded border border-gray-700 bg-gray-900 p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Subscription</h3>
            <p className="text-gray-400 text-sm mt-1">
              Current plan:{" "}
              <span className="font-medium">
                {isLoading ? "…" : prettyPlan(normalizedPlan)}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Plan changes are handled inside Shopify (you’ll see a standard
              approval screen).
            </p>
          </div>

          {/* Upgrade buttons: Monthly + Annual */}
          <div className="flex flex-wrap gap-2">
            {showUpgradeToStarter && (
              <>
                <button
                  onClick={() => goShopifyUpgrade("starter")}
                  disabled={billingBusy}
                  className="rounded bg-emerald-500 hover:bg-emerald-600 text-black px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Starter (Monthly)
                </button>
                <button
                  onClick={() => goShopifyUpgrade("starter_annual")}
                  disabled={billingBusy}
                  className="rounded bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  title="2 months free"
                >
                  Starter (Annual – 2 months free)
                </button>
              </>
            )}
            {showUpgradeToPro && (
              <>
                <button
                  onClick={() => goShopifyUpgrade("pro")}
                  disabled={billingBusy}
                  className="rounded bg-indigo-500 hover:bg-indigo-600 text-black px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Pro (Monthly)
                </button>
                <button
                  onClick={() => goShopifyUpgrade("pro_annual")}
                  disabled={billingBusy}
                  className="rounded bg-indigo-700 hover:bg-indigo-800 text-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  title="2 months free"
                >
                  Pro (Annual – 2 months free)
                </button>
              </>
            )}
          </div>
        </div>

        <ul className="mt-4 text-sm text-gray-300 list-disc pl-5 space-y-1">
          <li>
            <span className="font-medium">Starter:</span> Manual scans, dashboard
            KPIs, CSV export.
          </li>
          <li>
            <span className="font-medium">Pro:</span> Auto-scans, Slack/Email
            alerts, priority support.
          </li>
        </ul>
      </section>

      {/* NEW: Inventory Alerts */}
      <section id="inventory-prefs" className="rounded border border-gray-700 bg-gray-900 p-5 mt-8">
        <h3 className="text-xl font-semibold">Inventory Alerts</h3>
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="threshold" className="text-sm text-gray-400 w-48">
            Low-stock threshold
          </label>
          <input
            id="threshold"
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(0, Number(e.target.value || 0)))}
            className="bg-gray-800 rounded px-3 py-2 text-sm w-28"
          />
          <span className="text-xs text-gray-500">Alert when total available ≤ threshold</span>
        </div>
        <div className="mt-4">
          <button
            onClick={saveInventoryPrefs}
            className="bg-green-500 hover:bg-green-600 text-black px-4 py-2 rounded font-semibold text-sm"
          >
            Save
          </button>
        </div>
      </section>

      {/* NEW: Locations (Pro) */}
      <section id="locations" className="rounded border border-gray-700 bg-gray-900 p-5 mt-8">
        <h3 className="text-xl font-semibold">Locations (Pro)</h3>
        <p className="text-sm text-gray-400">
          Sum inventory across selected locations for alerts and scans.
        </p>

        <div className={`mt-4 space-y-3 ${!isPro ? "opacity-60" : ""}`}>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={multiLoc}
              disabled={!isPro}
              onChange={(e) => setMultiLoc(e.target.checked)}
            />
            <span className="text-sm">Enable multi-location</span>
          </label>

          {multiLoc && (
            <div className="pl-6">
              {locations.length === 0 ? (
                <p className="text-xs text-gray-400">No locations found.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {locations.map((loc) => {
                    const checked = locIds.includes(loc.id);
                    return (
                      <label key={loc.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setLocIds([...new Set([...locIds, loc.id])]);
                            else setLocIds(locIds.filter((x) => x !== loc.id));
                          }}
                          disabled={!isPro}
                        />
                        <span className="text-sm">{loc.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <button
              onClick={saveInventoryPrefs}
              disabled={!isPro}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-black px-4 py-2 rounded font-semibold text-sm"
            >
              Save
            </button>
            {!isPro && (
              <span className="ml-3 text-xs text-gray-400">
                Upgrade to Pro to enable multi-location.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Integrations — visible; locked on Starter */}
      <section id="integrations" className="mb-8 rounded border border-gray-700 bg-gray-900 p-5 mt-8">
        <h3 className="text-xl font-semibold">Integrations</h3>
        <p className="text-sm text-gray-400">Receive alerts via Slack or Email.</p>

        {/* Slack */}
        <div className={`mt-4 space-y-2 ${isStarter ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Slack Incoming Webhook</label>
            {isStarter && (
              <span className="text-xs bg-yellow-800 text-yellow-100 px-2 py-1 rounded">
                Locked (Starter)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm"
              placeholder="https://hooks.slack.com/services/XXX/YYY/ZZZ"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              disabled={isLoading || !canUseIntegrations}
            />
            <button
              onClick={saveSlack}
              disabled={!canUseIntegrations || saveBusy}
              className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={async () => {
                const r = await fetch("/api/integrations/slack/test", {
                  method: "POST",
                });
                alert(r.ok ? "Alert sent to Slack ✅" : "Slack alert failed");
              }}
              disabled={!canUseIntegrations || !slackUrl}
              className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Send alert
            </button>
          </div>
          {!canUseIntegrations && (
            <div className="text-xs text-gray-400">
              Upgrade to{" "}
              <button className="underline" onClick={() => goShopifyUpgrade("pro")}>
                Pro
              </button>{" "}
              to enable Slack alerts.
            </div>
          )}
        </div>

        {/* Email */}
        <div className={`mt-6 space-y-2 ${isStarter ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Notification Email</label>
            {isStarter && (
              <span className="text-xs bg-yellow-800 text-yellow-100 px-2 py-1 rounded">
                Locked (Starter)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm"
              placeholder="alerts@yourcompany.com"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              disabled={isLoading || !canUseIntegrations}
            />
            <button
              onClick={saveEmail}
              disabled={!canUseIntegrations || saveBusy}
              className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={async () => {
                const r = await fetch("/api/integrations/email/test", {
                  method: "POST",
                });
                alert(r.ok ? "Alert sent by email ✅" : "Email alert failed");
              }}
              disabled={!canUseIntegrations || !notificationEmail}
              className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Send alert
            </button>
          </div>
          {!canUseIntegrations && (
            <div className="text-xs text-gray-400">
              Upgrade to{" "}
              <button className="underline" onClick={() => goShopifyUpgrade("pro")}>
                Pro
              </button>{" "}
              to enable email alerts.
            </div>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded border border-gray-700 bg-gray-900 p-5 mt-8">
        <h3 className="text-xl font-semibold">Preferences</h3>
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="currency" className="text-sm text-gray-400 w-28">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => changeCurrency(e.target.value)}
            disabled={isLoading || currencySaving}
            className="bg-gray-800 rounded px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
            <option value="NZD">NZD</option>
          </select>
          {currencySaving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Affects how amounts are displayed (e.g., at-risk revenue).
        </p>
      </section>

      {/* Debug */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-gray-400">Debug</summary>
        <pre className="mt-2 text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-auto">
{JSON.stringify(
  {
    isLoading,
    plan: normalizedPlan,
    settings,
    threshold,
    multiLoc,
    locIds,
    locationsCount: locations.length || 0,
    slackUrl,
    notificationEmail,
    host,
    isEmbedded
  },
  null,
  2
)}
        </pre>
      </details>
    </main>
  );
}
