// src/app/layout.js
import "./globals.css";
import ClientNav from "@/components/ClientNav"; // 👈 new client nav

export const metadata = {
  title: "Ghost Stock Killer",
  description: "Detect and predict ghost inventory before it costs you money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* MUST be a plain <script>, first in <head>, no async/defer/module */}
        <script
          id="shopify-app-bridge-cdn"
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        ></script>
      </head>

      <body className="bg-gray-900 text-white min-h-screen">
        <ClientNav />   {/* 👈 preserves ?host=... on all links */}
        {children}
      </body>
    </html>
  );
}
