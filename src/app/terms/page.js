export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <main className="max-w-3xl mx-auto p-6 text-gray-200">
      <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>

      <p className="text-sm mb-4">
        These Terms of Service (“Terms”) govern your use of Ghost Stock Killer (“the App”), a Shopify app designed to monitor inventory and send low-stock alerts. By installing or using the App, you agree to these Terms.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Eligibility</h2>
      <p className="text-sm">You must be a registered Shopify merchant with an active store to use Ghost Stock Killer.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. License</h2>
      <p className="text-sm">We grant you a non-exclusive, non-transferable license to use the App solely for your store’s internal operations. You may not resell, sublicense, or reverse-engineer the App.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Service Availability</h2>
      <p className="text-sm">We strive to maintain 99.9% uptime. However, we do not guarantee uninterrupted service and are not liable for outages, delays, or data loss.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. Merchant Responsibilities</h2>
      <ul className="list-disc pl-6 space-y-2 text-sm">
        <li>Ensuring your Shopify store has valid inventory data</li>
        <li>Configuring alert thresholds appropriately</li>
        <li>Keeping your access token secure</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. Billing & Pricing</h2>
      <p className="text-sm">Ghost Stock Killer may offer free and paid tiers. If billing is enabled, charges will be processed via Shopify’s Billing API. You agree to pay all applicable fees.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Termination</h2>
      <p className="text-sm">You may uninstall the App at any time. We reserve the right to suspend or terminate access for violation of these Terms or abuse of the service.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Limitation of Liability</h2>
      <p className="text-sm">To the maximum extent permitted by law, Ghost Stock Killer is not liable for indirect, incidental, or consequential damages arising from your use of the App.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">8. Indemnification</h2>
      <p className="text-sm">You agree to indemnify and hold harmless Ghost Stock Killer from any claims, damages, or liabilities arising from your use of the App or violation of these Terms.</p>

      <h2 className="text-lg font-semibold mt-6 mb-2">9. Governing Law</h2>
      <p className="text-sm">These Terms are governed by the laws of the United Kingdom. Any disputes shall be resolved in the courts of England and Wales.</p>
    </main>
  );
}
