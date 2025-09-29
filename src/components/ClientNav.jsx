// src/components/ClientNav.jsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useCallback, useEffect, useState } from "react";

export default function ClientNav() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // read current QS
  const currentQs = searchParams?.toString() ?? "";

  // also persist & restore host in case QS is empty on first render
  const [storedHost, setStoredHost] = useState(null);

  useEffect(() => {
    try {
      const host = searchParams?.get("host");
      if (host) {
        sessionStorage.setItem("__shopify_host", host);
        setStoredHost(host);
      } else {
        const h = sessionStorage.getItem("__shopify_host");
        if (h) setStoredHost(h);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQs]);

  const suffix = useMemo(() => {
    if (currentQs) return `?${currentQs}`;
    if (storedHost) return `?host=${encodeURIComponent(storedHost)}`;
    return "";
  }, [currentQs, storedHost]);

  const go = useCallback(
    (e, pathname, hash = "") => {
      e.preventDefault();
      const url = pathname + suffix + (hash ? `#${hash}` : "");
      router.push(url);
    },
    [router, suffix]
  );

  return (
    <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">
        <a href={"/" + suffix} onClick={(e) => go(e, "/")}>Ghost Stock Killer</a>
      </h1>
      <div className="flex gap-4 text-sm items-center">
        <a className="hover:text-green-400" href={"/" + suffix} onClick={(e) => go(e, "/")}>Home</a>
        <a className="hover:text-green-400" href={"/dashboard" + suffix} onClick={(e) => go(e, "/dashboard")}>Dashboard</a>
        <a className="hover:text-green-400" href={"/settings" + suffix} onClick={(e) => go(e, "/settings")}>Settings</a>
        {/* query must precede the hash */}
        <a className="hover:text-green-400" href={"/" + suffix + "#pricing"} onClick={(e) => go(e, "/", "pricing")}>Pricing</a>
      </div>
    </nav>
  );
}
