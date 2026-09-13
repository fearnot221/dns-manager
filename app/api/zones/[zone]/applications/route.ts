import { z } from "zod";
import { auditMutation } from "@/lib/audit/mutation";
import { logAuditEvent } from "@/lib/audit/service";
import { requireActor } from "@/lib/auth/session";
import { canManageZone } from "@/lib/auth/permissions";
import { normalizeZoneName } from "@/lib/dns/names";
import { powerdns } from "@/lib/powerdns/client";
import { assertSameOrigin } from "@/lib/api/security";
import { apiError, ApiError } from "@/lib/api/respond";
import { setZoneApplicationAccess } from "@/lib/requests/zone-access";

export const PATCH = auditMutation(async (request: Request, { params }: { params: Promise<{ zone: string }> }) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    const zone = normalizeZoneName((await params).zone);
    if (!canManageZone(actor, zone)) throw new ApiError("找不到可管理的網域。", 404);
    const input = z.object({ enabled: z.boolean(), expectedUpdatedAt: z.string().datetime().nullable() }).strict().parse(await request.json());
    await powerdns.getZone(zone);
    const changes = await setZoneApplicationAccess(zone, input.enabled, input.expectedUpdatedAt, actor.email);
    await logAuditEvent({ actor, zone, action: "UPDATE_ZONE_APPLICATION_ACCESS", ...changes, success: true, request });
    return Response.json({ access: changes.after });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return apiError(new ApiError("設定同時被修改，請重新整理後再試。", 409));
    return apiError(error);
  }
});
