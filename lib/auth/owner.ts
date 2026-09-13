import type { Actor, GlobalRole } from "@/lib/dns/types";

export const OWNER_EMAIL = "fearnot@ce.ncu.edu.tw";
export const OWNER_IDENTIFIER = "115502532";
export const isOwnerEmail = (email: string) => email.trim().toLowerCase() === OWNER_EMAIL;
export const isOwner = (actor: Actor) => actor.portalIdentifier === OWNER_IDENTIFIER && actor.globalRole === "SUPER_ADMIN";
export const isGlobalAdmin = (actor: Actor) => actor.globalRole === "ADMIN" || actor.globalRole === "SUPER_ADMIN";
// Historical SUPER_ADMIN accounts keep admin access but never gain owner privileges.
export const resolvedGlobalRole = (_email: string, role: GlobalRole, identifier?: string | null): GlobalRole => identifier === OWNER_IDENTIFIER ? "SUPER_ADMIN" : role === "SUPER_ADMIN" ? "ADMIN" : role;
export function mayManageUser(actor: Actor, target: { email: string; portalIdentifier?: string | null; globalRole: GlobalRole; zoneAdmin?: boolean }) {
  if (target.portalIdentifier === OWNER_IDENTIFIER) return false;
  return isOwner(actor) || (isGlobalAdmin(actor) && target.globalRole === "USER" && !target.zoneAdmin);
}
