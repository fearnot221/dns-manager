import type { Actor, GlobalRole } from "@/lib/dns/types";

export const OWNER_EMAIL = "fearnot@ce.ncu.edu.tw";
export const isOwnerEmail = (email: string) => email.trim().toLowerCase() === OWNER_EMAIL;
export const isOwner = (actor: Actor) => isOwnerEmail(actor.email) && actor.globalRole === "SUPER_ADMIN";
export const isGlobalAdmin = (actor: Actor) => actor.globalRole === "ADMIN" || actor.globalRole === "SUPER_ADMIN";
// Historical SUPER_ADMIN accounts keep admin access but never gain owner privileges.
export const resolvedGlobalRole = (email: string, role: GlobalRole): GlobalRole => role === "SUPER_ADMIN" && !isOwnerEmail(email) ? "ADMIN" : role;
export function mayManageUser(actor: Actor, target: { email: string; globalRole: GlobalRole; zoneAdmin?: boolean }) {
  if (isOwnerEmail(target.email)) return false;
  return isOwner(actor) || (isGlobalAdmin(actor) && target.globalRole === "USER" && !target.zoneAdmin);
}
