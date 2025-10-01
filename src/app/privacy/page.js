export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <main className="max-w-3xl mx-auto p-6 text-gray-200">
      <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>

      <p className="mb-3 text-sm">
        Ghost Stock Killer (“we”, “us”, or “our”) is committed to protecting the privacy of merchants who install and use our Shopify app (“you” or “your”). This Privacy Policy explains what data we collect, how we use it, and your rights under applicable laws.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Information We Collect</h2>
      <ul className="list-disc pl-6 space-y-2 text-sm">
        <li>Shop identifier (e.g. ghost-app.myshopify.com)</li>
        <li>Access token (encrypted at rest)</li>
        <li>Inventory metadata (product IDs, quantities, thresholds)</li>
        <li>Alert settings (low-stock rules, notification preferences)</li>
        <li>Optional Slack webhook URL and notification email</li>
      </ul>

      <p className="mt-4 text-sm">
        We do not collect payment information, customer data, or personally identifiable information beyond what Shopify provides.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Your Data</h2>
      <ul className="list-disc pl-6 space-y-2 text-sm">
        <li>Authenticate your store via Shopify OAuth</li>
        <li>Monitor inventory levels and trigger alerts</li>
        <li>Send notifications via email or Slack</li>
        <li>Register mandatory Shopify compliance webhooks</li>
        <li>Improve app performance and reliability</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Data Storage & Security</h2>
      <p className="text-sm">
        All data is stored securely using industry-standard encryption. Access tokens are encrypted at rest. Our infrastructure is hosted on Vercel and Supabase, with strict access controls and audit logging.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. Data Retention</h2>
      <p className="text-sm">
        We retain your data only as long as your store is connected to Ghost Stock Killer. If you uninstall the app, your access token is revoked and your store record is deleted within 30 days.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. Data Deletion & GDPR Compliance</h2>
      <p className="text-sm">
        You may request data deletion at any time by contacting support at <code>support@ghost-stock.co.uk</code> or using Shopify’s GDPR API endpoints.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Third-Party Services</h2>
      <p className="text-sm">
        Ghost Stock Killer integrates with Shopify (OAuth, inventory API, webhook registration), Brevo (email delivery), and Slack (optional webhook alerts). These services may process data according to their own privacy policies.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Changes to This Policy</h2>
      <p className="text-sm">
        We may update this Privacy Policy from time to time. Changes will be posted on this page with a revised effective date.
      </p>
    </main>
  );
}
