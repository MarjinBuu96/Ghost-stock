"use client";

import { useEffect, useRef } from "react";
import createApp from "@shopify/app-bridge";
import { Redirect } from "@shopify/app-bridge/actions";

import StockDashboardMock from "@/components/StockDashboardMock";
import BlogHeader from "@/components/BlogHeader";

const BLOG_URL = "https://blog.ghost-stock.co.uk";

export default function Home() {
  const appRef = useRef(null);
  const isEmbedded =
    typeof window !== "undefined" && window.top !== window.self;

  // If we are inside Shopify Admin, initialize App Bridge so we can redirect safely
  useEffect(() => {
    if (!isEmbedded) return;
    const params = new URLSearchParams(window.location.search);
    const host =
      params.get("host") ||
      document.cookie.match(/(?:^|;\s*)shopifyHost=([^;]+)/)?.[1] ||
      null;
    if (!host) return;

    let app = window.__SHOPIFY_APP__;
    if (!app) {
      app = createApp({
        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
        host,
        forceRedirect: true,
      });
      window.__SHOPIFY_APP__ = app;
    }
    appRef.current = app;
  }, [isEmbedded]);

  function onBlogClick(e) {
    if (!isEmbedded) return; // normal navigation on public site
    e.preventDefault();
    const app = appRef.current;
    if (!app) {
      // Fallback: open a new tab if App Bridge isn't ready
      window.open(BLOG_URL, "_blank", "noopener,noreferrer");
      return;
    }
    const redirect = Redirect.create(app);
    // REMOTE = full external URL (outside Admin)
    redirect.dispatch(Redirect.Action.REMOTE, BLOG_URL);
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
            Book a Demo
          </a>
          <a
            href="#how"
            className="border border-gray-400 px-6 py-3 rounded hover:bg-gray-800"
          >
            See How It Works
          </a>
          {/* Use absolute URL + App Bridge redirect when embedded */}
          <a
            href={BLOG_URL}
            onClick={onBlogClick}
            target={isEmbedded ? undefined : "_blank"}
            rel={isEmbedded ? undefined : "noopener noreferrer"}
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
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800 p-6 rounded shadow">
            <h4 className="text-xl font-semibold mb-4">Starter</h4>
            <p className="text-green-400 text-2xl font-bold mb-4">£9.99/mo</p>
            <p className="mb-6">3 manual scans/week, Shopify integration</p>
            <a
              href="#demo"
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block"
            >
              Get Started
            </a>
          </div>
          <div className="bg-gray-800 p-6 rounded shadow border border-green-500">
            <h4 className="text-xl font-semibold mb-4">Pro</h4>
            <p className="text-green-400 text-2xl font-bold mb-4">£29/mo</p>
            <p className="mb-6">
              Multi-location tracking, ghost stock prediction, auto daily scans & more
            </p>
            <a
              href="#demo"
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block"
            >
              Get Started
            </a>
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
