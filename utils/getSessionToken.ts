// utils/getSessionToken.ts
export async function getSessionToken(app) {
  const { getSessionToken } = window.app;
  try {
    const token = await getSessionToken(app);
    return token;
  } catch (err) {
    console.error("Failed to get session token", err);
    return null;
  }
}
