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
        {/* REQUIRED for CDN App Bridge to auto-init */}
        <meta
          name="shopify-api-key"
          content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "5860dca7a3c5d0818a384115d221179a"}
        />
        {/* Must be a plain script, no async/defer/module, and early in <head> */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
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
