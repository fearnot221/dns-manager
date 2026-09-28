import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/owner";
import { assertSameOrigin } from "@/lib/api/security";
import { ApiError, apiError } from "@/lib/api/respond";
import { auditMutation } from "@/lib/audit/mutation";
import { deleteInspection } from "@/lib/inventory/inspections";

const schema = z.object({ recordId: z.string().regex(/^[a-f0-9]{64}$/), expectedUpdatedAt: z.string().datetime() }).strict();
export const DELETE = auditMutation(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isOwner(actor)) throw new ApiError("無法刪除此清查紀錄。", 403);
    const { id } = await params;
    return Response.json(await deleteInspection(actor, z.string().min(1).max(100).parse(id), schema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
