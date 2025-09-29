# Ghost Stock

Ghost Stock is a premium Shopify app that helps merchants monitor inventory health, detect stock anomalies, and receive actionable alerts—all from a sleek embedded dashboard.

Built with Next.js, Prisma, and Shopify App Bridge, Ghost Stock is optimized for speed, clarity, and conversion. Whether you're a solo merchant or scaling across multiple storefronts, Ghost Stock keeps your inventory lean and your alerts sharp.

---

## 🚀 Features

- 🔍 **Smart Inventory Scanning**  
  Detect low stock, overstock, and velocity mismatches with one click.

- 📊 **Sales Velocity Integration**  
  Pulls real-time order data to calculate expected inventory ranges.

- ⚠️ **Alert Engine**  
  Flags anomalies with severity levels and SKU-level breakdowns.

- 📦 **Scan Limits & Upgrade Flow**  
  Starter users get 3 scans/week. Upgrade to Pro for unlimited scans, Slack alerts, and priority support.

- 🛠️ **Embedded Shopify Admin Experience**  
  Seamless App Bridge navigation, session token auth, and CDN-safe rendering.

- 🔐 **Secure OAuth & Billing**  
  Fully integrated with Shopify’s billing API and session token flow.

---

## 🧰 Tech Stack

- **Frontend**: Next.js 13 App Router, Tailwind CSS, SWR
- **Backend**: Prisma ORM, PostgreSQL (Neon), NextAuth
- **Shopify**: App Bridge, REST API, Embedded Admin
- **Infra**: Vercel, Neon DB, GitHub Actions

📦 Deployment Guide for New Owner
This app is fully production-ready and can be deployed in under 30 minutes.

1. git clone https://github.com/MarjinBuu96/Ghost-stock.git
cd ghost-stock

2. .env
 SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_products,read_orders,write_products
SHOPIFY_APP_URL=https://your-vercel-url.vercel.app

DATABASE_URL=your_neon_postgres_url
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=https://your-vercel-url.vercel.app

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
(STRIPE ONLY REQUIRED IF USING THE APP STANDALONE OUTSIDE OF SHOPIFY)

3.Generate NEXTAUTH_SECRET with:
openssl rand -base64 32

4.  Set Up Neon DB
Create a Neon project

Paste DATABASE_URL into .env

5. Run:
npx prisma db push
npx prisma generate

6.  Configure Shopify App
Create a new app in Shopify Partners

Set App URL to your Vercel domain

Add OAuth redirect URLs:

Code
https://your-vercel-url.vercel.app/api/auth/callback
https://your-vercel-url.vercel.ap

add Billing callback:

Code
https://your-vercel-url.vercel.app/api/shopify/billing/confirm
Enable App Bridge and Session Token Authentication

5. Deploy to Vercel
Push repo to GitHub

Import to Vercel

Set environment variables

Deploy

6. Test the Flow
Install app on a test store

Trigger /api/scan 3 times

Modal appears on 4th scan

Upgrade via App Bridge redirect

7. Stripe Setup (Optional)
Create products and pricing plans

Set webhook to /api/stripe/webhook

Add Stripe keys to .env

🧪 Troubleshooting
Scan limit errors: Confirm scanCount and lastScanReset exist in UserSettings

App Bridge redirect fails: Use Redirect.Action.ADMIN_PATH and strip domain

Session token issues: Confirm authOptions and getServerSession() are wired

Billing errors: Check Shopify billing scopes and webhook logs

📈 Monetization
Ghost Stock is built for conversion:

Starter → Pro upgrade funnel

Embedded modal triggers

Slack webhook integration (Pro only)

Future: Scheduled unlocks, access logs, multi-store support

📄 License
This app is proprietary and not open source. For licensing or acquisition inquiries, contact Jordan.

🧠 Built by
Jordan — founder of ProPlatform and Ghost Stock. Architected for scale, designed for clarity, and optimized for conversion.
---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000


