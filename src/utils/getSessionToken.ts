// src/utils/getSessionToken.ts
type ClientApplication = import('@shopify/app-bridge').ClientApplication;

export async function getSessionToken(app: ClientApplication): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('getSessionToken must be called in the browser');
  }
  // Use the maintained utilities entrypoint (not the deprecated app-bridge-utils pkg)
  const { getSessionToken: fetchSessionToken } = await import('@shopify/app-bridge/utilities');
  return fetchSessionToken(app);
}
