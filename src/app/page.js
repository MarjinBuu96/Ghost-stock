"use client";


import StockDashboardMock from "@/components/StockDashboardMock";

export default function Home() {
  return (
    <main className="px-6">
      {/* Hero */}
      <section className="text-center py-16">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">Stop Selling Stock You Don’t Have</h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
          Ghost inventory is killing your revenue and reputation. Our tool detects and predicts stock errors before they cost you money.
        </p>
        <div className="flex justify-center gap-4">
          <a href="#demo" className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-black font-semibold">Book a Demo</a>
          <a href="#how" className="border border-gray-400 px-6 py-3 rounded hover:bg-gray-800">See How It Works</a>
        </div>
        {/* Replace the old placeholder image with this live mock component */}
        <StockDashboardMock />
      </section>

      {/* How it works */}
      <section id="how" className="py-16 bg-gray-800 rounded-xl max-w-5xl mx-auto px-6">
        <h3 className="text-3xl font-bold text-center mb-12">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">🔗</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Connect Your Store</h4>
            <p>Works with Shopify 2 clicks.</p>
          </div>
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">📊</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Scan & Detect</h4>
            <p>We compare live stock against sales patterns & flag ghost stock instantly.</p>
          </div>
          <div className="bg-gray-700 p-6 rounded shadow">
            <span className="text-green-400 text-4xl">🔮</span>
            <h4 className="text-xl font-semibold mt-4 mb-2">Predict Problems</h4>
            <p> Forecasts when errors will happen so you can fix them before they hurt sales.</p>
          </div>
        </div>
      </section>

      {/* Pricing + Demo */}
      <section id="pricing" className="py-16 text-center max-w-5xl mx-auto">
        <h3 className="text-3xl font-bold mb-12">Pricing</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800 p-6 rounded shadow">
            <h4 className="text-xl font-semibold mb-4">Starter</h4>
            <p className="text-green-400 text-2xl font-bold mb-4">FREE/mo</p>
            <p className="mb-6">3 Manual scans per week, Shopify integration</p>
            <a href="#demo" className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block">Get Started</a>
          </div>
          <div className="bg-gray-800 p-6 rounded shadow border border-green-500">
            <h4 className="text-xl font-semibold mb-4">Pro</h4>
            <p className="text-green-400 text-2xl font-bold mb-4">£29/mo</p>
            <p className="mb-6">Multi-location tracking + ghost stock prediction, Auto Daily scans & more</p>
            <a href="#demo" className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-black font-semibold inline-block">Get Started</a>
          </div>
          
        </div>
      </section>

      <section id="demo" className="py-16 text-center max-w-md mx-auto">
        <h3 className="text-3xl font-bold mb-6">Request a Demo</h3>
        <form className="space-y-4">
          <input type="text" placeholder="Your Name" className="w-full px-4 py-2 rounded text-black" required />
          <input type="email" placeholder="Your Email" className="w-full px-4 py-2 rounded text-black" required />
          <button className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-black font-semibold w-full">Request Demo</button>
        </form>
      </section>
    </main>
  );
}
