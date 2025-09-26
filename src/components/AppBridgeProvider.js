'use client';

import { AppProvider } from '@shopify/app-bridge-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function AppBridgeProvider({ children }) {
  const searchParams = useSearchParams();
  const host = searchParams.get('host');

  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (host) {
      setConfig({
        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
        host,
        forceRedirect: true, // ensures your app stays in Shopify Admin
      });
    }
  }, [host]);

  if (!config) return null; // wait for host to load

  return (
    <AppProvider config={config}>
      {children}
    </AppProvider>
  );
}
