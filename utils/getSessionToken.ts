// utils/getSessionToken.ts
export async function getSessionToken(
  app: import('@shopify/app-bridge').ClientApplication
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('getSessionToken must be called in the browser');
  }
  const { getSessionToken: fetchSessionToken } = await import('@shopify/app-bridge/utilities');
  return fetchSessionToken(app);
}
