import "./globals.css";
import Link from "next/link";
import Providers from "@/components/Providers"; // <-- client wrapper
import UserMenu from "@/components/UserMenu";   // (client component is fine here)

export const metadata = {
  title: "Ghost Stock Killer",
  description: "Detect and predict ghost inventory before it costs you money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold"><Link href="/">Ghost Stock Killer</Link></h1>
            <div className="flex gap-4 text-sm items-center">
              <Link href="/" className="hover:text-green-400">Home</Link>
              <Link href="/dashboard" className="hover:text-green-400">Dashboard</Link>
              <a href="/#pricing" className="hover:text-green-400">Pricing</a>
              <UserMenu />
            </div>
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}

