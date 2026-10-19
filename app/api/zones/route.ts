import { auditMutation } from "@/lib/audit/mutation";
import { requireActor } from "@/lib/auth/session";
import { effectiveZoneRole, canManageZone, canAccessZoneManagement, canManageRecord } from "@/lib/auth/permissions";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, ApiError } from "@/lib/api/respond";

export async function GET() {
  try {
    const actor = await requireActor();
    if (!canAccessZoneManagement(actor)) throw new ApiError("僅網域管理員可檢視 Zone。", 403);
    const zones = await powerdns.listZones();
    return Response.json({ zones: zones.filter((zone) => canManageZone(actor, zone.name)).map((zone) => ({ ...zone, rrsets: undefined, recordCount: zone.rrsets.filter((r)=>canManageRecord(actor,zone.name,r.name,r.type)).reduce((n, r) => n + r.records.length, 0), permission: effectiveZoneRole(actor, zone.name)})) });
  } catch (error) { return apiError(error); }
}
export const POST = auditMutation(async () => Response.json({ error: "網站不提供新增網域功能，請由 DNS 維運端管理。" }, { status: 405, headers: { Allow: "GET" } }));
