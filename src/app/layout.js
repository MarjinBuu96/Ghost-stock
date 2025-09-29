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
        {/* (optional but harmless) lets some builds auto-read the key */}
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}
        />

        {/* MUST be plain (no async/defer/module) */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>

        {/* ✅ Universal bootstrap: picks the right global, creates app once, and stores it */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var qs = new URLSearchParams(window.location.search);
                  var host = qs.get('host');

                  // fallback to cookie if middleware already stored it
                  if (!host) {
                    var m = document.cookie.match(/(?:^|;\\s*)shopifyHost=([^;]+)/);
                    if (m) host = m[1];
                  }
                  if (!host) return;

                  var createApp =
                    (window.shopify && window.shopify.createApp) ||
                    (window.appBridge && window.appBridge.createApp) ||
                    (window["app-bridge"] && window["app-bridge"].default) ||
                    null;

                  if (!createApp) return;
                  if (!window.__SHOPIFY_APP__) {
                    window.__SHOPIFY_APP__ = createApp({
                      apiKey: "${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}",
                      host: host,
                      forceRedirect: true
                    });
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>

      <body className="bg-gray-900 text-white min-h-screen">
        <Suspense fallback={null}>
          <ClientNav />
        </Suspense>
        {children}
      </body>
    </html>
  );
}