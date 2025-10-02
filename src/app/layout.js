// src/app/layout.js
import "./globals.css";
import { Suspense } from "react";
import ClientNav from "@/components/ClientNav";

export const metadata = {
  title: "Ghost Stock Killer",
  description: "Detect and predict ghost inventory before it costs you money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Lets Shopify read the key in-iframe if needed */}
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}
        />

        {/* App Bridge CDN FIRST (sync) so the inline bootstrap can see it */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>

        {/* App Bridge bootstrap + host cookie persist */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var qs = new URLSearchParams(window.location.search);
                  var host = qs.get('host') || (document.cookie.match(/(?:^|;\\s*)shopifyHost=([^;]+)/) || [])[1] || '';
                  if (!host) return;

                  // Persist host for billing/routes
                  document.cookie = 'shopifyHost=' + host + '; path=/; SameSite=None; Secure';

                  var AB = window['app-bridge'] || window.appBridge || null;
                  if (!AB || !AB.createApp) return;

                  if (!window.__SHOPIFY_APP__) {
                    window.__SHOPIFY_APP__ = AB.createApp({
                      apiKey: '${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}',
                      host: host,
                      forceRedirect: true
                    });
                  }
                } catch (e) {
                  console.warn('App Bridge init failed:', e);
                }
              })();
            `,
          }}
        />
      </head>

      {/* Use the unified theme class from globals.css */}
      <body className="gs-page">
        <noscript>
          <div style="background:#111;color:#fff;padding:8px 12px;text-align:center;">
            This app works best with JavaScript enabled.
          </div>
        </noscript>

        <Suspense fallback={null}>
          <ClientNav />
        </Suspense>

        {children}
      </body>
    </html>
  );
}
