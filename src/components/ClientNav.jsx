"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ClientNav() {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">
        <Link href={"/" + suffix}>Ghost Stock Killer</Link>
      </h1>
      <div className="flex gap-4 text-sm items-center">
        <Link href={"/" + suffix} className="hover:text-green-400">Home</Link>
        <Link href={"/dashboard" + suffix} className="hover:text-green-400">Dashboard</Link>
        <Link href={"/settings" + suffix} className="hover:text-green-400">Settings</Link>
        <a href={"/#pricing" + suffix} className="hover:text-green-400">Pricing</a>
      </div>
    </nav>
  );
}
