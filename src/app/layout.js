// src/app/layout.js
import "./globals.css";
import Link from "next/link";
// ❌ remove: import Script from "next/script";

export const metadata = {
  title: "Ghost Stock Killer",
  description: "Detect and predict ghost inventory before it costs you money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* ✅ MUST be the first <script>, no async/defer/module */}
        <script
          id="shopify-app-bridge-cdn"
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        ></script>

        {/* optional bootstrap: keep it AFTER the CDN tag */}
        <script
          id="app-bridge-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var params = new URLSearchParams(window.location.search);
                var host = params.get('host');
                if (!host || !window.appBridge || !window.appBridge.createApp) return;
                if (!window.__SHOPIFY_APP__) {
                  window.__SHOPIFY_APP__ = window.appBridge.createApp({
                    apiKey: "${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}",
                    host: host,
                    forceRedirect: true
                  });
                }
              })();
            `,
          }}
        />
      </head>

      <body className="bg-gray-900 text-white min-h-screen">
        <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <Link href="/">Ghost Stock Killer</Link>
          </h1>
          <div className="flex gap-4 text-sm items-center">
            <Link href="/" className="hover:text-green-400">Home</Link>
            <Link href="/dashboard" className="hover:text-green-400">Dashboard</Link>
            <Link href="/settings" className="hover:text-green-400">Settings</Link>
            <a href="/#pricing" className="hover:text-green-400">Pricing</a>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}
