// src/components/OnboardingChecklist.jsx
"use client";
export default function OnboardingChecklist({ hasStore, hasRunScan, hasNotifications }) {
  const items = [
    { label: "Connect your Shopify store", done: hasStore, href: "/settings" },
    { label: "Run your first scan", done: hasRunScan, href: "/dashboard" },
    { label: "Configure alerts (Slack/Email)", done: hasNotifications, href: "/settings#integrations" },
  ];
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-4">
      <h4 className="font-semibold mb-2">Getting started</h4>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full text-xs grid place-items-center ${it.done ? "bg-green-500 text-black" : "bg-gray-600"}`}>
              {it.done ? "✓" : i + 1}
            </span>
            <a href={it.href} className={`text-sm ${it.done ? "text-gray-300" : "underline"}`}>{it.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
