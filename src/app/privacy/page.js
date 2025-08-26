// src/app/privacy/page.js
export const metadata = { title: "Privacy Policy" };
export default function Privacy() {
  return (
    <main className="max-w-3xl mx-auto p-6 text-gray-200">
      <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
      <p className="mb-3">We store the minimum data required to operate Ghost Stock Killer…</p>
      <ul className="list-disc pl-6 space-y-2 text-sm">
        <li>Shop identifier, access token (encrypted at rest)</li>
        <li>Inventory & alert metadata (no cardholder data)</li>
        <li>Optional Slack webhook URL / notification email</li>
      </ul>
      <p className="mt-4 text-sm">For data deletion requests, contact support or use the Shopify GDPR endpoints.</p>
    </main>
  );
}
