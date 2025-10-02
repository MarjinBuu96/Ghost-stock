// src/app/partners/page.jsx
"use client";

import React, { useEffect, useState } from "react";

export default function PartnersPage() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Capture UTM params for attribution
  const [utm, setUtm] = useState({ utmSource: "", utmMedium: "", utmCampaign: "" });
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      setUtm({
        utmSource: p.get("utm_source") || "",
        utmMedium: p.get("utm_medium") || "",
        utmCampaign: p.get("utm_campaign") || "",
      });
    } catch {}
  }, []);

  function isValidEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErr("");

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    // Basic front-end validation
    if (!payload.name || !isValidEmail(payload.email)) {
      setErr("Please enter a valid name and work email.");
      setSubmitting(false);
      return;
    }

    // Add UTM + simple honeypot field
    payload.utmSource = utm.utmSource;
    payload.utmMedium = utm.utmMedium;
    payload.utmCampaign = utm.utmCampaign;
    payload.hp = payload.hp || ""; // hidden field; bots often fill or miss this

    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "apply_failed");
      }

      setDone(true);
      e.currentTarget.reset();
    } catch {
      // Fallback → open mail client with prefilled body
      const subject = encodeURIComponent("Ghost Stock – Partner Application");
      const body = encodeURIComponent(
        `Agency: ${payload.agency || ""}\nWebsite: ${payload.website || ""}\nContact: ${
          payload.name || ""
        } <${payload.email || ""}>\nClients/verticals: ${payload.verticals || ""}\nExpected monthly installs: ${
          payload.volume || ""
        }\nNotes: ${payload.notes || ""}\n\nUTM: ${utm.utmSource || "-"} / ${utm.utmMedium || "-"} / ${utm.utmCampaign || "-"}`
      );
      window.location.href = `mailto:partners@ghost-stock.co.uk?subject=${subject}&body=${body}`;
      setTimeout(() => setDone(true), 400);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-white">
      {/* Hero */}
      <section className="px-6 pt-16 pb-12 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="inline-block text-xs tracking-wide uppercase text-emerald-300/80 bg-emerald-900/30 border border-emerald-800 px-2 py-1 rounded">
              Agency Partner Program
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mt-4">
              Earn <span className="text-emerald-300">20% lifetime</span> + cash bonuses for ending ghost inventory.
            </h1>
            <p className="text-gray-300 mt-4 text-lg">
              Add Ghost Stock to every Shopify build. Multi-location alerts (Pro), low-stock thresholds, and automated scans.
              You focus on growth—we keep inventory honest.
            </p>

            <div className="flex flex-wrap gap-3 mt-6">
              <a href="#apply" className="bg-emerald-400 hover:bg-emerald-300 text-black font-semibold px-5 py-3 rounded">
                Apply Now
              </a>
              <a href="#terms" className="border border-gray-700 hover:bg-gray-800 px-5 py-3 rounded">
                View Terms
              </a>
            </div>

            <div className="mt-6 text-sm text-gray-400">
              Milestones: <span className="text-emerald-300 font-semibold">+£100</span> at 5 installs •{" "}
              <span className="text-emerald-300 font-semibold">+£250</span> at 15 installs
            </div>
          </div>

          {/* Highlight Card */}
          <div className="bg-gradient-to-b from-gray-900/60 to-gray-900/20 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-xl font-semibold">Why agencies partner with Ghost Stock</h3>
            <ul className="mt-4 space-y-3 text-gray-200">
              <li className="flex gap-3">
                <span>✅</span>
                <span>Stop ghost stock and avoid surprise stockouts for clients</span>
              </li>
              <li className="flex gap-3">
                <span>✅</span>
                <span>Multi-location aggregation on Pro (perfect for 2–10 locations)</span>
              </li>
              <li className="flex gap-3">
                <span>✅</span>
                <span>Low-stock thresholds + proactive Slack/Email alerts</span>
              </li>
              <li className="flex gap-3">
                <span>✅</span>
                <span>Simple pricing, 14-day trial, and fast setup</span>
              </li>
            </ul>
            <div className="mt-6 grid grid-cols-2 gap-4 text-center">
              <div className="bg-gray-900/50 rounded p-4 border border-gray-800">
                <p className="text-3xl font-extrabold text-emerald-300">20%</p>
                <p className="text-xs text-gray-400">Lifetime Revenue Share</p>
              </div>
              <div className="bg-gray-900/50 rounded p-4 border border-gray-800">
                <p className="text-3xl font-extrabold text-emerald-300">£350</p>
                <p className="text-xs text-gray-400">Bonuses at 5 & 15 installs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-12 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6 mt-6">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <p className="text-3xl">🔗</p>
            <h3 className="font-semibold mt-2">Get your partner link</h3>
            <p className="text-sm text-gray-300 mt-1">We’ll issue a unique link and a deal-reg form for pipeline protection.</p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <p className="text-3xl">📈</p>
            <h3 className="font-semibold mt-2">Recommend on every build</h3>
            <p className="text-sm text-gray-300 mt-1">Install during launch or add to monthly QA. We’ll support your team.</p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <p className="text-3xl">💸</p>
            <h3 className="font-semibold mt-2">Earn 20% + bonuses</h3>
            <p className="text-sm text-gray-300 mt-1">Lifetime rev-share on Starter/Pro; cash at 5 & 15 active installs.</p>
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section className="px-6 py-12 max-w-6xl mx-auto">
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-2xl font-bold">Milestone bonuses</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg p-4 bg-gray-900/60 border border-gray-800">
              <p className="text-sm text-gray-300">Cumulative Active Installs</p>
              <p className="text-3xl font-extrabold text-emerald-300 mt-1">5</p>
              <p className="text-sm mt-1">+£100 one-time bonus</p>
            </div>
            <div className="rounded-lg p-4 bg-gray-900/60 border border-gray-800">
              <p className="text-sm text-gray-300">Cumulative Active Installs</p>
              <p className="text-3xl font-extrabold text-emerald-300 mt-1">15</p>
              <p className="text-sm mt-1">+£250 one-time bonus</p>
            </div>
          </div>
        </div>
      </section>

      {/* Apply form */}
      <section id="apply" className="px-6 py-12 max-w-3xl mx-auto">
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-2">Apply now</h2>
          <p className="text-gray-300 text-sm">We’ll reply within 1–2 business days with your partner link and sandbox access.</p>

          {done ? (
            <div className="mt-6 p-4 rounded bg-emerald-900/30 border border-emerald-800 text-emerald-200">
              Thanks! We’ve received your application. We’ll be in touch shortly.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4 mt-6" noValidate>
              {/* Honeypot (hidden) */}
              <input name="hp" tabIndex={-1} autoComplete="off" className="hidden" />

              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Contact Name</label>
                <input
                  name="name"
                  required
                  className="mt-1 w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="Alex Agency"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Work Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="alex@agency.com"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Agency</label>
                <input name="agency" className="mt-1 w-full bg-gray-800 rounded px-3 py-2" placeholder="Conversion Co." />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Website</label>
                <input name="website" className="mt-1 w-full bg-gray-800 rounded px-3 py-2" placeholder="https://agency.com" />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Clients / Verticals</label>
                <input
                  name="verticals"
                  className="mt-1 w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="Apparel, Beauty, Food & Bev"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm text-gray-300">Expected Monthly Installs</label>
                <select name="volume" className="mt-1 w-full bg-gray-800 rounded px-3 py-2" defaultValue="1-2">
                  <option value="1-2">1–2</option>
                  <option value="3-5">3–5</option>
                  <option value="6-10">6–10</option>
                  <option value=">10">10+</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-300">Notes</label>
                <textarea
                  name="notes"
                  rows={4}
                  className="mt-1 w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="Anything we should know?"
                />
              </div>

              {err && <div className="md:col-span-2 text-sm text-red-300">{err}</div>}

              <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-400 hover:bg-emerald-300 text-black font-semibold px-5 py-2 rounded disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Submit Application"}
                </button>
                <a href="mailto:partners@ghost-stock.co.uk" className="text-sm underline text-gray-300">
                  Email us instead
                </a>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Terms */}
      <section id="terms" className="px-6 py-12 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold">Program Terms (Summary)</h2>
        <ul className="mt-4 space-y-2 text-sm text-gray-300 list-disc pl-6">
          <li>
            <b>Commission:</b> 20% lifetime share on net subscription revenue for Starter/Pro (monthly & annual). Trials pay once
            converted.
          </li>
          <li>
            <b>Milestones:</b> +£100 at 5 installs; +£250 at 15 installs (one-time bonuses).
          </li>
          <li>
            <b>Attribution:</b> Last-click via partner link or approved deal-registration; 90-day window.
          </li>
          <li>
            <b>Eligibility:</b> Subscription active ≥ 30 days; clawbacks on refunds/chargebacks.
          </li>
          <li>
            <b>Payouts:</b> Monthly, net-30, via Stripe/PayPal; £50 minimum.
          </li>
          <li>
            <b>Scope:</b> Subscriptions only; self-deals require approval.
          </li>
          <li>
            <b>Co-marketing:</b> Logo/name permitted; media kit provided.
          </li>
          <li>
            <b>Good standing:</b> No spam, false claims, or brand-term bidding.
          </li>
          <li>
            <b>Changes:</b> We may update terms with 30 days’ notice. Earned commissions honored.
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-4">Full terms available on request.</p>
      </section>

      {/* CTA Footer */}
      <footer className="px-6 py-12 border-t border-gray-800 bg-[#0b0f14]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold">Ready to partner?</h3>
            <p className="text-gray-300 text-sm mt-1">We’ll get your link, media kit, and sandbox set up.</p>
          </div>
          <div className="flex gap-3">
            <a href="#apply" className="bg-emerald-400 hover:bg-emerald-300 text-black font-semibold px-5 py-2 rounded">
              Apply Now
            </a>
            <a href="mailto:partners@ghost-stock.co.uk" className="border border-gray-700 hover:bg-gray-800 px-5 py-2 rounded">
              Contact Us
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
