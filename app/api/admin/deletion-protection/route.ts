import { requireActor } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/owner";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { logAuditEvent } from "@/lib/audit/service";
import { deletionProtectionStatus, saveDeletionPassword } from "@/lib/security/deletion-protection";

export async function GET() {
  try {
    const actor = await requireActor();
    if (!canAccessZoneManagement(actor)) throw new ApiError("只有管理員可檢視刪除保護設定。", 403);
    return Response.json(await deletionProtectionStatus(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export const PUT = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isOwner(actor)) throw new ApiError("只有最高管理員可以設定刪除保護密碼。", 403);
    const status = await saveDeletionPassword(actor, await request.json());
    await logAuditEvent({ actor, zone: "", action: "UPDATE_DELETION_PROTECTION", after: status, success: true, request });
    return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
});
