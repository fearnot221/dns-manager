import { isOwner, isGlobalAdmin } from "./owner";
import type { Actor, RecordType, ZoneRole } from "@/lib/dns/types";

const ROLE_RANK:Record<ZoneRole,number> = { VIEWER:1, EDITOR:2, ADMIN:3 };
export const PROTECTED_TYPES:ReadonlySet<RecordType> = new Set(["SOA","NS","DS","DNSKEY"]);

export function effectiveZoneRole(actor:Actor, zone:string):ZoneRole|"SUPER_ADMIN"|null {
  if (actor.globalRole === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (actor.globalRole === "ADMIN") return "ADMIN";
  return actor.zoneRoles[canonical(zone)] ?? null;
}
export function canViewZone(actor:Actor, zone:string):boolean { return effectiveZoneRole(actor,zone) !== null; }
export function canEditZone(actor:Actor, zone:string):boolean { const role=effectiveZoneRole(actor,zone); return role === "SUPER_ADMIN" || role === "EDITOR" || role === "ADMIN"; }
export function canManageZone(actor:Actor, zone:string):boolean { const role=effectiveZoneRole(actor,zone); return role === "SUPER_ADMIN" || role === "ADMIN"; }
export function canManagePermissions(actor:Actor, zone:string):boolean { return isOwner(actor) && canManageZone(actor,zone); }
export function canCreateZone(actor:Actor):boolean { return actor.globalRole === "SUPER_ADMIN"; }
export function canDeleteZone(actor:Actor):boolean { return actor.globalRole === "SUPER_ADMIN"; }
export function canAccessZoneManagement(actor:Actor):boolean { return isGlobalAdmin(actor) || Object.values(actor.zoneRoles).includes("ADMIN"); }
export function canEditRecordType(actor:Actor, zone:string, type:RecordType):boolean {
  const role=effectiveZoneRole(actor,zone);
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  return role === "EDITOR" && !PROTECTED_TYPES.has(type);
}
export function canDeleteRecord(actor:Actor, zone:string, type:RecordType, name:string):boolean {
  if (!canEditRecordType(actor,zone,type)) return false;
  if ((type === "SOA" || type === "NS") && canonical(name) === canonical(zone)) return actor.globalRole === "SUPER_ADMIN";
  return true;
}
export function hasAtLeast(role:ZoneRole, required:ZoneRole):boolean { return ROLE_RANK[role] >= ROLE_RANK[required]; }
function canonical(value:string):string { return `${value.toLowerCase().replace(/\.+$/,"")}.`; }
