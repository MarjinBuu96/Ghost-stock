"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useCallback } from "react";

export default function ClientNav() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Preserve whatever Shopify passed (host, shop, etc.)
  const qs = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const makeUrl = useCallback(
    (pathname) => (qs ? `${pathname}?${qs}` : pathname),
    [qs]
  );

  const go = useCallback(
    (e, pathname, hash = "") => {
      e.preventDefault();
      const url = makeUrl(pathname) + (hash ? `#${hash}` : "");
      router.push(url);
    },
    [router, makeUrl]
  );

  return (
    <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">
        <a href={makeUrl("/")} onClick={(e) => go(e, "/")}>
          Ghost Stock Killer
        </a>
      </h1>
      <div className="flex gap-4 text-sm items-center">
        <a className="hover:text-green-400" href={makeUrl("/")} onClick={(e) => go(e, "/")}>
          Home
        </a>
        <a className="hover:text-green-400" href={makeUrl("/dashboard")} onClick={(e) => go(e, "/dashboard")}>
          Dashboard
        </a>
        <a className="hover:text-green-400" href={makeUrl("/settings")} onClick={(e) => go(e, "/settings")}>
          Settings
        </a>
        {/* query must come before the hash */}
        <a className="hover:text-green-400" href={makeUrl("/") + "#pricing"} onClick={(e) => go(e, "/", "pricing")}>
          Pricing
        </a>
      </div>
    </nav>
  );
}
