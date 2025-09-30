export default function StockDashboardMock() {
  return (
    <div className="mx-auto mt-10 max-w-5xl bg-gray-800/70 rounded-xl shadow-lg ring-1 ring-gray-700 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between bg-gray-900/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center">
            <span className="text-green-400 font-bold">GSK</span>
          </div>
          <h4 className="text-lg font-semibold">Inventory Health — Last 24h</h4>
        </div>
        <div className="text-sm text-gray-300">Store: <span className="font-semibold text-white">Acme Outdoors</span></div>
      </div>

      <div className="grid md:grid-cols-3 gap-0">
        {/* KPI column */}
        <div className="p-6 bg-gray-800 space-y-4 border-r border-gray-700">
          <div className="bg-gray-900/50 p-4 rounded-lg">
            <p className="text-sm text-gray-400">Suspected Ghost SKUs</p>
            <p className="text-3xl font-bold text-red-400">12</p>
          </div>
          <div className="bg-gray-900/50 p-4 rounded-lg">
            <p className="text-sm text-gray-400">At-Risk Revenue</p>
            <p className="text-3xl font-bold text-yellow-300">£4,820</p>
          </div>
          <div className="bg-gray-900/50 p-4 rounded-lg">
            <p className="text-sm text-gray-400">Data Confidence</p>
            <p className="text-3xl font-bold text-green-400">98.1%</p>
          </div>
        </div>

        {/* Alerts table */}
        <div className="md:col-span-2 p-6 bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold">Active Alerts</h5>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Filter:</span>
              <button className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">All</button>
              <button className="text-xs px-2 py-1 rounded bg-red-700/60 hover:bg-red-700 text-red-100">High</button>
              <button className="text-xs px-2 py-1 rounded bg-yellow-700/60 hover:bg-yellow-700 text-yellow-100">Med</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg ring-1 ring-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-900/60 text-gray-300">
                <tr>
                  <th className="text-left px-4 py-2">SKU</th>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-left px-4 py-2">System Qty</th>
                  <th className="text-left px-4 py-2">Expected Qty</th>
                  <th className="text-left px-4 py-2">Risk</th>
                  <th className="text-left px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr className="bg-gray-900/30">
                  <td className="px-4 py-2 font-mono">ACM-JKT-M</td>
                  <td className="px-4 py-2">All-Weather Jacket — M</td>
                  <td className="px-4 py-2">8</td>
                  <td className="px-4 py-2 text-red-300">0–2</td>
                  <td className="px-4 py-2"><span className="px-2 py-1 rounded bg-red-700 text-red-100">High</span></td>
                  <td className="px-4 py-2"><button className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-black">Start Count</button></td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">ACM-BT-BLK</td>
                  <td className="px-4 py-2">Trail Bottle — Black</td>
                  <td className="px-4 py-2">42</td>
                  <td className="px-4 py-2 text-yellow-200">34–36</td>
                  <td className="px-4 py-2"><span className="px-2 py-1 rounded bg-yellow-700 text-yellow-100">Med</span></td>
                  <td className="px-4 py-2"><button className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-black">Start Count</button></td>
                </tr>
                <tr className="bg-gray-900/30">
                  <td className="px-4 py-2 font-mono">ACM-CAP-OLV</td>
                  <td className="px-4 py-2">Cap — Olive</td>
                  <td className="px-4 py-2 text-red-300">0</td>
                  <td className="px-4 py-2">7–9</td>
                  <td className="px-4 py-2"><span className="px-2 py-1 rounded bg-red-700 text-red-100">High</span></td>
                  <td className="px-4 py-2"><button className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-black">Start Count</button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Root Cause (Top)</p>
              <p className="text-sm">Receiving mismatch (PO-1042)</p>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Predicted Next Error</p>
              <p className="text-sm">SKU ACM-JKT-L in ~3 days</p>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Suggested Action</p>
              <p className="text-sm">Cycle count A-isle, bin A12–A16</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
