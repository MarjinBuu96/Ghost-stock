// src/app/page.js
"use client";

import { useEffect, useRef, useState } from "react";
import createApp from "@shopify/app-bridge";
import { Redirect } from "@shopify/app-bridge/actions";

import StockDashboardMock from "@/components/StockDashboardMock";
import BlogHeader from "@/components/BlogHeader";

const BLOG_URL = "https://blog.ghost-stock.co.uk";
const ALLOWED_PLANS = ["starter", "starter_annual", "pro", "pro_annual"];

export default function Home() {
  const appRef = useRef(null);
  const [host, setHost] = useState(null);
  const isEmbedded =
    typeof window !== "undefined" && window.top !== window.self;

  // If we are inside Shopify Admin, initialize App Bridge so we can redirect safely
  useEffect(() => {
    if (!isEmbedded) return;
    const params = new URLSearchParams(window.location.search);
    const hostParam =
      params.get("host") ||
      document.cookie.match(/(?:^|;\s*)shopifyHost=([^;]+)/)?.[1] ||
      null;
    if (!hostParam) return;

    // Remember & persist host for billing calls
    setHost(hostParam);
    document.cookie = `shopifyHost=${hostParam}; path=/; SameSite=None; Secure`;

    let app = window.__SHOPIFY_APP__;
    if (!app) {
      app = createApp({
        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
        host: hostParam,
        forceRedirect: true,
      });
      window.__SHOPIFY_APP__ = app;
    }
    appRef.current = app;
  }, [isEmbedded]);

  function onBlogClick(e) {
    // In Admin, use App Bridge to open the external URL in a NEW TAB
    if (!isEmbedded) return; // let the native anchor handle public site
    e.preventDefault();
    try {
      const app = appRef.current;
      if (app) {
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.REMOTE, {
          url: BLOG_URL,
          newContext: true, // ✅ force outside Admin, new tab
        });
        return;
      }
    } catch {}
    // Fallback
    window.open(BLOG_URL, "_blank", "noopener,noreferrer");
  }

  // Start Shopify billing for a given plan
  async function startUpgrade(plan) {
    try {
      if (!isEmbedded) {
        // Not in Admin: send to demo/request flow (or change to /settings)
        window.location.hash = "#demo";
        return;
      }
      const safePlan = ALLOWED_PLANS.includes(plan) ? plan : "starter";

      const res = await fetch(`/api/shopify/billing/upgrade?host=${host || ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: safePlan }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.confirmationUrl) throw new Error(json?.error || "Upgrade failed");

      // Open Shopify approval outside the iframe
      window.open(json.confirmationUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Upgrade failed:", err);
      alert("Could not start Shopify upgrade. Please try from the Settings page.");
    }
  }

  return (
    <main className="px-6">
      {/* Hero */}
      <section className="text-center py-16">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          Stop Selling Stock You Don’t Have
        </h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
          Ghost inventory is killing your revenue and reputation. Our tool
          detects and predicts stock errors before they cost you money.
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="#demo"
            className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-black font-semibold"
          >
            Start 14-day Free Trial
          </a>
          <a
            href="#how"
            className="border border-gray-400 px-6 py-3 rounded hover:bg-gray-800"
          >
            See How It Works
          </a>

          {/* Blog — always target _blank; App Bridge handles embed with newContext */}
          <a
            href={BLOG_URL}
            onClick={onBlogClick}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-green-500 text-green-400 px-6 py-3 rounded hover:bg-gray-800"
          >
            Read the Blog
          </a>
        </div>

        {/* Live mock */}
        <StockDashboardMock />
      </section>

      {/* Blog header (latest posts teaser) */}
      <section className="py-10 max-w-5xl mx-auto">
        <BlogHeader />
      </section>

      {/* How it works */}
      <section id="how" className="py-16 bg-gray-800 rounded-xl max-w-5xl mx-auto px-6">
        <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">🔗</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Connect Your Store</h4>
            <p>Works with Shopify — 2 clicks.</p>
          </div>
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">📊</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Scan & Detect</h4>
            <p>We compare live stock against sales patterns & flag ghost stock instantly.</p>
          </div>
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">🔮</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Predict Problems</h4>
            <p>Forecasts when errors will happen so you can fix them before they hurt sales.</p>
          </div>
        </div>
      </section>

      {/* Pricing + Demo */}
      <section id="pricing" className="py-16 text-center max-w-5xl mx-auto">
        <h3 className="text-3xl font-bold mb-12">Pricing</h3>

        {/* Cards: Starter (Monthly), Pro (Monthly), Annual (2 months free) */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Starter Monthly */}
          <div className="bg-gray-800 p-6 rounded shadow">
            <h4 className="text-xl font-semibold mb-1">Starter</h4>
            <p className="text-green-400 text-2xl font-bold">£14.99/mo</p>
            <p className="text-xs text-gray-400 mb-3">14-day free trial • Billed after day 14</p>
            <p className="mb-2 text-sm">All features gated. Upgrade anytime.</p>
            <p className="mb-6 text-xs text-emerald-300">
              First 20 installs: <span className="font-semibold">£9.99/mo</span> — grandfathered while installed
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); startUpgrade("starter"); }}
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block"
            >
              Get Started
            </a>
          </div>

          {/* Pro Monthly */}
          <div className="bg-gray-800 p-6 rounded shadow border border-green-500">
            <h4 className="text-xl font-semibold mb-1">Pro</h4>
            <p className="text-green-400 text-2xl font-bold">£29/mo</p>
            <p className="text-xs text-gray-400 mb-3">Annual option available — 2 months free</p>
            <p className="mb-6">
              Multi-location tracking, ghost stock prediction, auto daily scans & more
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); startUpgrade("pro"); }}
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block"
            >
              Start Pro
            </a>
          </div>

          {/* Annual (2 months free) */}
          <div className="bg-gray-800 p-6 rounded shadow">
            <h4 className="text-xl font-semibold mb-1">Annual — 2 months free</h4>
            <div className="space-y-2 mb-4">
              <p className="text-green-400 text-lg font-semibold">Starter: £149.90/yr</p>
              <p className="text-green-400 text-lg font-semibold">Pro: £290/yr</p>
            </div>
            <p className="text-xs text-gray-400 mb-6">Billed annually (equivalent to 10 months)</p>
            <div className="flex items-center justify-center gap-3">
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); startUpgrade("starter_annual"); }}
                className="border border-gray-400 hover:bg-gray-800 px-3 py-2 rounded font-semibold inline-block"
                title="2 months free"
              >
                Starter Annual
              </a>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); startUpgrade("pro_annual"); }}
                className="border border-gray-400 hover:bg-gray-800 px-3 py-2 rounded font-semibold inline-block"
                title="2 months free"
              >
                Pro Annual
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="py-16 text-center max-w-md mx-auto">
        <h3 className="text-3xl font-bold mb-6">Request a Demo</h3>
        <form className="space-y-4">
          <input
            type="text"
            placeholder="Your Name"
            className="w-full px-4 py-2 rounded text-black"
            required
          />
          <input
            type="email"
            placeholder="Your Email"
            className="w-full px-4 py-2 rounded text-black"
            required
          />
          <button className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-black font-semibold w-full">
            Request Demo
          </button>
        </form>
      </section>
    </main>
  );
}
