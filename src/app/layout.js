import "./globals.css";
import { Suspense } from "react";
import ClientNav from "@/components/ClientNav";

export const metadata = { title: "Ghost Stock Killer", description: "Detect and predict ghost inventory before it costs you money." };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script id="shopify-app-bridge-cdn" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
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
