// utils/getSessionToken.ts
export async function getSessionToken(
  app: import('@shopify/app-bridge').ClientApplication
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('getSessionToken must be called in the browser');
  }
  // ✅ FIX: use the correct package name and dynamic import
  const { getSessionToken: fetchSessionToken } = await import('@shopify/app-bridge-utils');
  return fetchSessionToken(app);
}
