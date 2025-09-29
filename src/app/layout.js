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
        {/* ✅ Optional: lets some builds auto-read the key */}
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}
        />

        {/* ✅ Shopify App Bridge CDN script FIRST */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>

        {/* ✅ App Bridge bootstrap logic */}
<script
  dangerouslySetInnerHTML={{
    __html: `
      (function () {
        try {
          var qs = new URLSearchParams(window.location.search);
          var host = qs.get('host');
          if (!host) {
            var m = document.cookie.match(/(?:^|;\\s*)shopifyHost=([^;]+)/);
            if (m) host = m[1];
          }
          if (!host) return;

          var AppBridge =
            window.shopify ||
            window.appBridge ||
            window["app-bridge"] ||
            null;

          if (!AppBridge) return;

          window.appBridge = AppBridge; // ✅ force expose

          var createApp =
            AppBridge.createApp ||
            AppBridge.default ||
            null;

          if (!createApp) return;

          if (!window.__SHOPIFY_APP__) {
            window.__SHOPIFY_APP__ = createApp({
              apiKey: "${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}",
              host: host,
              forceRedirect: true
            });
          }
        } catch (e) {
          console.error("App Bridge init failed:", e);
        }
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
