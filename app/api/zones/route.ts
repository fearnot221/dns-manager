import { auditMutation } from "@/lib/audit/mutation";
import { requireActor } from "@/lib/auth/session";
import { effectiveZoneRole, canManageZone, canAccessZoneManagement } from "@/lib/auth/permissions";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, ApiError } from "@/lib/api/respond";
import { zoneApplicationAccess, closedAccess } from "@/lib/requests/zone-access";
import { normalizeZoneName } from "@/lib/dns/names";

export async function GET() {
  try {
    const actor = await requireActor();
    if (!canAccessZoneManagement(actor)) throw new ApiError("僅網域管理員可檢視 Zone。", 403);
    const zones = await powerdns.listZones();
    const access = await zoneApplicationAccess();
    return Response.json({ zones: zones.filter((zone) => canManageZone(actor, zone.name)).map((zone) => ({ ...zone, rrsets: undefined, recordCount: zone.rrsets.reduce((n, r) => n + r.records.length, 0), permission: effectiveZoneRole(actor, zone.name), applicationAccess: access[normalizeZoneName(zone.name)] ?? closedAccess })) });
  } catch (error) { return apiError(error); }
}
export const POST = auditMutation(async () => Response.json({ error: "網站不提供新增網域功能，請由 DNS 維運端管理。" }, { status: 405, headers: { Allow: "GET" } }));
