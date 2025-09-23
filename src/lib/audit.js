// src/lib/audit.js
import { prisma } from "@/lib/prisma";

/**
 * Safe audit logger. Skips if orgId is missing (useful during backfill/dev).
 */
export async function logAuditSafe({ orgId, actor, action, target = null, meta = null }) {
  try {
    if (!orgId) {
      // Skip quietly if no orgId is known yet
      return { ok: false, skipped: "no_orgId" };
    }
    await prisma.auditLog.create({
      data: { orgId, actor, action, target, meta },
    });
    return { ok: true };
  } catch (e) {
    console.warn("Audit log failed:", e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Back-compat alias with old positional signature.
 * Any existing `logAudit(orgId, actor, action, target, meta)` calls will work.
 */
export async function logAudit(orgId, actor, action, target = null, meta = null) {
  return logAuditSafe({ orgId, actor, action, target, meta });
}
