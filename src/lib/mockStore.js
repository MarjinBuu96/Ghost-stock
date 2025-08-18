// Very simple in-memory store for dev/demo
let _alerts = [
  { id: "1", sku: "ACM-JKT-M", product: "All-Weather Jacket — M", systemQty: 8, expectedMin: 0, expectedMax: 2, severity: "high" },
  { id: "2", sku: "ACM-BT-BLK", product: "Trail Bottle — Black", systemQty: 42, expectedMin: 34, expectedMax: 36, severity: "med" },
  { id: "3", sku: "ACM-CAP-OLV", product: "Cap — Olive", systemQty: 0, expectedMin: 7, expectedMax: 9, severity: "high" },
];

export function listAlerts() {
  return _alerts;
}

export function resolveAlert(id) {
  _alerts = _alerts.filter(a => a.id !== id);
  return true;
}

// Fake “scan” logic – adds a random alert
export function scanAndGenerate() {
  const id = String(Date.now());
  const samples = [
    ["ACM-BEANIE-NVY", "Beanie — Navy", 5, 0, 1, "high"],
    ["ACM-GLOVE-BLK", "Thermal Gloves — Black", 18, 24, 26, "med"],
    ["ACM-FLSK-SS", "Flask — Stainless", 0, 6, 8, "high"],
  ];
  const pick = samples[Math.floor(Math.random() * samples.length)];
  _alerts.unshift({
    id,
    sku: pick[0],
    product: pick[1],
    systemQty: pick[2],
    expectedMin: pick[3],
    expectedMax: pick[4],
    severity: pick[5],
  });
  return _alerts[0];
}
