import type { Actor, GlobalRole } from "@/lib/dns/types";

export const OWNER_IDENTIFIER = "115502532";
export function accountOwnerIdentifier(accounts: { provider?: string; providerAccountId: string }[] = [], role?: GlobalRole) {
  const logto = accounts.find((account) => account.provider === "logto");
  if (role === "SUPER_ADMIN" && logto && process.env.LOGTO_OWNER_SUB && logto.providerAccountId === process.env.LOGTO_OWNER_SUB) return OWNER_IDENTIFIER;
  const legacy = accounts.find((account) => !account.provider || account.provider === "ncu-portal")?.providerAccountId;
  // Historical student IDs are display data, not current proof of owner identity.
  return legacy && legacy !== OWNER_IDENTIFIER ? legacy : null;
}
export const isOwner = (actor: Actor) => actor.portalIdentifier === OWNER_IDENTIFIER && actor.globalRole === "SUPER_ADMIN";
export const isGlobalAdmin = (actor: Actor) => actor.globalRole === "ADMIN" || actor.globalRole === "SUPER_ADMIN";
// Historical SUPER_ADMIN accounts keep admin access but never gain owner privileges.
export const resolvedGlobalRole = (_email: string, role: GlobalRole, identifier?: string | null): GlobalRole => role === "SUPER_ADMIN" ? identifier === OWNER_IDENTIFIER ? "SUPER_ADMIN" : "ADMIN" : role;
export function mayManageUser(actor: Actor, target: { email: string; portalIdentifier?: string | null; globalRole: GlobalRole; zoneAdmin?: boolean }) {
  if (target.portalIdentifier === OWNER_IDENTIFIER) return false;
  return isOwner(actor) || (isGlobalAdmin(actor) && target.globalRole === "USER" && !target.zoneAdmin);
}
