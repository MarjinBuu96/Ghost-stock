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
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}
        />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var qs = new URLSearchParams(window.location.search);
                  var host = qs.get('host') || (document.cookie.match(/(?:^|;\\s*)shopifyHost=([^;]+)/) || [])[1] || '';
                  if (!host) return;
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
      <body className="gs-page">
        <noscript>
          <div
            style={{
              background: "#111",
              color: "#fff",
              padding: "8px 12px",
              textAlign: "center",
            }}
          >
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
