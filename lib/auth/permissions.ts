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
export function canReviewDnsRequest(actor: Actor, request: { zoneName: string; recordName?: string; recordType?: string; unitId?: string | null }): boolean {
  return (request.recordName && request.recordType ? canManageRecord(actor, request.zoneName, request.recordName, request.recordType) : canManageWholeZone(actor, request.zoneName)) && (!request.unitId || isGlobalAdmin(actor));
}
export function canEditRecordType(actor:Actor, zone:string, type:RecordType, name?:string):boolean {
  const role=name ? effectiveRecordRole(actor,zone,name,type) : effectiveWholeZoneRole(actor,zone);
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  return role === "EDITOR" && !PROTECTED_TYPES.has(type);
}
export function canDeleteRecord(actor:Actor, zone:string, type:RecordType, name:string):boolean {
  if (!canEditRecordType(actor,zone,type,name)) return false;
  if ((type === "SOA" || type === "NS") && canonical(name) === canonical(zone)) return actor.globalRole === "SUPER_ADMIN";
  return true;
}
export function hasAtLeast(role:ZoneRole, required:ZoneRole):boolean { return ROLE_RANK[role] >= ROLE_RANK[required]; }
function canonical(value:string):string { return `${value.toLowerCase().replace(/\.+$/,"")}.`; }

/** Exact name or a DNS-label wildcard; wildcard covers descendants, never its apex. */
export function recordMatchesPattern(name:string, zone:string, pattern:string|null):boolean {
  const normalizedName=canonical(name), normalizedZone=canonical(zone);
  if (normalizedName !== normalizedZone && !normalizedName.endsWith(`.${normalizedZone}`)) return false;
  if (pattern === null) return true;
  const normalizedPattern=canonical(pattern.trim());
  if (normalizedPattern.startsWith("*.")) {
    const suffix=normalizedPattern.slice(2);
    if (suffix !== normalizedZone && !suffix.endsWith(`.${normalizedZone}`)) return false;
    return normalizedName !== suffix && normalizedName.endsWith(`.${suffix}`);
  }
  return !normalizedPattern.includes("*") && normalizedName === normalizedPattern;
}
function matchingRole(actor:Actor,zone:string,match:(grant:NonNullable<Actor["zoneGrants"]>[number])=>boolean) {
  if (actor.globalRole === "SUPER_ADMIN") return "SUPER_ADMIN" as const;
  if (actor.globalRole === "ADMIN") return "ADMIN" as const;
  // Legacy in-process fixtures/unrestricted actors have no grant collection.
  if (!actor.zoneGrants) return actor.zoneRoles[canonical(zone)] ?? null;
  let role:ZoneRole|null=null;
  for (const grant of actor.zoneGrants) if (canonical(grant.zoneName)===canonical(zone) && match(grant) && (!role || ROLE_RANK[grant.role]>ROLE_RANK[role])) role=grant.role;
  return role;
}
export function effectiveRecordRole(actor:Actor,zone:string,name:string,type:string) {
  return matchingRole(actor,zone,(grant)=>recordMatchesPattern(name,zone,grant.resourcePattern) && (!grant.allowedRecordTypes?.length || grant.allowedRecordTypes.includes(type)));
}
export function effectiveWholeZoneRole(actor:Actor,zone:string) {
  return matchingRole(actor,zone,(grant)=>grant.resourcePattern===null && !grant.allowedRecordTypes?.length);
}
export function canManageRecord(actor:Actor,zone:string,name:string,type:string):boolean {
  const role=effectiveRecordRole(actor,zone,name,type);return role==="ADMIN"||role==="SUPER_ADMIN";
}
export function canManageWholeZone(actor:Actor,zone:string):boolean {
  const role=effectiveWholeZoneRole(actor,zone);return role==="ADMIN"||role==="SUPER_ADMIN";
}
