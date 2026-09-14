import { describe,expect,it } from "vitest";
import { canDeleteRecord, canEditRecordType, canManagePermissions, canViewZone, canReviewDnsRequest } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/dns/types";
const actor=(role:"VIEWER"|"EDITOR"|"ADMIN"):Actor=>({id:"u",email:"user@example.com",globalRole:"USER",zoneRoles:{"example.com.":role}});
describe("permission engine",()=>{
  it("keeps unit review system-admin-only and personal review zone-scoped", () => {
    const request = { zoneName: "example.com." };
    expect(canReviewDnsRequest(actor("ADMIN"), request)).toBe(true);
    expect(canReviewDnsRequest(actor("ADMIN"), { ...request, unitId: "unit" })).toBe(false);
    expect(canReviewDnsRequest(actor("ADMIN"), { zoneName: "other.test." })).toBe(false);
    expect(canReviewDnsRequest(actor("EDITOR"), request)).toBe(false);
    expect(canReviewDnsRequest({ ...actor("VIEWER"), globalRole: "ADMIN" }, { ...request, unitId: "unit" })).toBe(true);
  });
  it("isolates unassigned zones",()=>{expect(canViewZone(actor("ADMIN"),"secret.example.")).toBe(false);expect(canViewZone(actor("VIEWER"),"example.com.")).toBe(true);});
  it("keeps viewers read-only",()=>expect(canEditRecordType(actor("VIEWER"),"example.com.","A")).toBe(false));
  it("allows editors to edit normal types",()=>expect(canEditRecordType(actor("EDITOR"),"example.com.","A")).toBe(true));
  it("protects system types from editors",()=>{expect(canEditRecordType(actor("EDITOR"),"example.com.","SOA")).toBe(false);expect(canDeleteRecord(actor("EDITOR"),"example.com.","NS","example.com.")).toBe(false);});
  it("only the protected owner can delegate zone roles",()=>{expect(canManagePermissions(actor("EDITOR"),"example.com.")).toBe(false);expect(canManagePermissions(actor("ADMIN"),"example.com.")).toBe(false);expect(canManagePermissions({id:"owner",portalIdentifier:"115502532",email:"fearnot@ce.ncu.edu.tw",globalRole:"SUPER_ADMIN",zoneRoles:{}},"example.com.")).toBe(true);});
  it("gives super admins global access",()=>{const root:Actor={id:"r",email:"root@example.com",globalRole:"SUPER_ADMIN",zoneRoles:{}};expect(canViewZone(root,"anything.example.")).toBe(true);expect(canDeleteRecord(root,"example.com.","SOA","example.com.")).toBe(true);});
});
