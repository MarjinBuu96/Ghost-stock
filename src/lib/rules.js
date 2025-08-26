import { prisma } from "./prisma";

/**
 * Minimal JSON-Logic evaluator supporting: {"and":[...]}, {"or":[...]}, {"!":expr},
 * comparisons: {">":[a,b]}, {">=":[a,b]}, {"<":[a,b]}, {"<=":[a,b]}, {"==":[a,b]}, {"!=":[a,b]}
 * variables: {"var":"field"}  (taken from 'ctx')
 */
function val(x, ctx) {
  if (x && typeof x === "object" && !Array.isArray(x)) {
    if (x.var) return ctx[x.var];
  }
  return x;
}
function evalLogic(expr, ctx) {
  if (expr == null) return false;
  if (typeof expr !== "object" || Array.isArray(expr)) return !!val(expr, ctx);

  if ("and" in expr) return expr.and.every(e => evalLogic(e, ctx));
  if ("or" in expr) return expr.or.some(e => evalLogic(e, ctx));
  if ("!" in expr) return !evalLogic(expr["!"], ctx);

  const ops = [">", ">=", "<", "<=", "==", "!="];
  for (const op of ops) {
    if (op in expr) {
      const [a, b] = expr[op];
      const A = val(a, ctx);
      const B = val(b, ctx);
      switch (op) {
        case ">": return A > B;
        case ">=": return A >= B;
        case "<": return A < B;
        case "<=": return A <= B;
        case "==": return A == B;       // eslint-disable-line eqeqeq
        case "!=": return A != B;       // eslint-disable-line eqeqeq
      }
    }
  }
  // Unknown op -> false
  return false;
}

/**
 * Load active rules for org
 */
export async function loadRulesForOrg(orgId) {
  return prisma.rule.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Evaluate rules against each inventory row. If a rule matches, emit a MED alert by default.
 * You can extend meta like severity override later.
 */
export function evaluateRules(rows, salesMap, rules) {
  const extraAlerts = [];
  for (const r of rows) {
    const key = r.sku || String(r.variantId) || String(r.inventory_item_id);
    const recentSales = Number(salesMap[key] || 0);

    const ctx = {
      sku: r.sku,
      product: r.product,
      price: Number(r.price || 0),
      systemQty: Number(r.systemQty || 0),
      recentSales,
    };

    for (const rule of rules || []) {
      const ok = evalLogic(rule.jsonLogic, ctx);
      if (ok) {
        extraAlerts.push({
          sku: r.sku || key,
          product: r.product || "",
          systemQty: ctx.systemQty,
          expectedMin: 0,         // rule-driven; adjust if you want
          expectedMax: 0,
          severity: "med",        // default; you can add rule.meta.severity later
        });
      }
    }
  }
  return extraAlerts;
}
