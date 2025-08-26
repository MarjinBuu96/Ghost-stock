// src/lib/audit.js
import { prisma } from "@/lib/prisma";

/**
 * Safe audit logger. If orgId is missing, it quietly skips logging.
 * This avoids Prisma errors until Organizations are fully wired.
 */
export async function logAuditSafe({ orgId, actor, action, target = null, meta = null }) {
  try {
    if (!orgId) return; // skip when we don’t have an org to attach to
    await prisma.auditLog.create({
      data: {
        orgId,          // required relation scalar
        actor,          // e.g., store.userEmail (or shop)
        action,         // e.g., "scan.run"
        target,         // e.g., store.shop or alert id
        meta,           // JSON
      },
    });
  } catch (e) {
    console.warn("Audit log failed:", e?.message || e);
  }
}
