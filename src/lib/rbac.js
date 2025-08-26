import { prisma } from "./prisma";

export const ROLE_RANK = { viewer: 1, manager: 2, owner: 3 };
export function isAtLeast(role, min) {
  return (ROLE_RANK[String(role)||"viewer"] || 0) >= (ROLE_RANK[String(min)||"viewer"] || 0);
}

/**
 * Resolve a caller's role for an org. In embedded mode we use store.userEmail as actor.
 */
export async function getActorAndRole(orgId, actorEmail) {
  let role = "viewer";
  if (orgId && actorEmail) {
    const m = await prisma.membership.findUnique({
      where: { orgId_userEmail: { orgId, userEmail: actorEmail } },
      select: { role: true },
    });
    if (m?.role) role = m.role;
  }
  return { actorEmail, role };
}

/** Guard for routes that require a minimum role */
export async function requireRole(orgId, actorEmail, minRole = "manager") {
  const { role } = await getActorAndRole(orgId, actorEmail);
  if (!isAtLeast(role, minRole)) {
    const err = new Error(`forbidden_role:${role}<${minRole}`);
    err.statusCode = 403;
    return err;
  }
  return null;
}
