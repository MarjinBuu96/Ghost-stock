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
        {/* MUST be a plain tag (no async/defer/module) */}
        <script
          id="shopify-app-bridge-cdn"
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        ></script>

        {/* 👇 Early bootstrap so Shopify removes its click-block overlay */}
        <script
          id="app-bridge-bootstrap"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var qs = new URLSearchParams(window.location.search);
                  var host = qs.get('host');
                  if (!host) return;
                  if (window.appBridge && !window.__SHOPIFY_APP__) {
                    window.__SHOPIFY_APP__ = window.appBridge.createApp({
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
