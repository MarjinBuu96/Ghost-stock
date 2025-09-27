// src/app/layout.js
import "./globals.css";
import Link from "next/link";
import Script from "next/script";

export const metadata = {
  title: "Ghost Stock Killer",
  description: "Detect and predict ghost inventory before it costs you money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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

        {/* 👇 Add a script to initialize App Bridge */}
        <Script id="app-bridge-init" strategy="afterInteractive">
          {`
            (function() {
              const urlParams = new URLSearchParams(window.location.search);
              const host = urlParams.get('host');
              if (!host) return;

              window.app = window['app-bridge'].default;
              window.actions = window.app.actions;

              const app = window.app.createApp({
                apiKey: "${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}",
                host: host,
                forceRedirect: true,
              });

              window.shopifyApp = app;
            })();
          `}
        </Script>

        {children}
      </body>
    </html>
  );
}
