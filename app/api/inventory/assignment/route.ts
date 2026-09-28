import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { assertSameOrigin } from "@/lib/api/security";
import { ApiError, apiError } from "@/lib/api/respond";
import { auditMutation } from "@/lib/audit/mutation";
import { assignRecordUnit } from "@/lib/inventory/assignment";

const schema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), zoneName: z.string().min(1).max(253), recordName: z.string().min(1).max(253), recordType: z.string().min(1).max(20), content: z.string().max(65535), expectedUpdatedAt: z.string().datetime().nullable(), unitId: z.string().trim().min(1).max(100) }).strict();
export const PUT = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以指派 DNS 所屬單位。", 403);
    return Response.json(await assignRecordUnit(actor, schema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
