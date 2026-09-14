import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { logAuditEvent } from "@/lib/audit/service";
import { readApplicationPolicy, saveApplicationPolicy } from "@/lib/requests/policy";
import { applicationPolicySchema } from "@/lib/requests/policy-model";
import { z } from "zod";
export async function GET() { try { await requireActor(); return Response.json({ policy: await readApplicationPolicy() }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); } }
export const PUT = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request); const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅系統管理員可調整申請限制。", 403);
    const input = z.object({ policy: applicationPolicySchema, expectedUpdatedAt: z.iso.datetime().nullable() }).strict().parse(await request.json());
    const changes = await saveApplicationPolicy(input.policy, input.expectedUpdatedAt);
    await logAuditEvent({ actor, zone: "", action: "UPDATE_APPLICATION_POLICY", ...changes, success: true, request });
    return Response.json({ policy: changes.after });
  } catch (error) { if ((error as { code?: string }).code === "P2034") return apiError(new ApiError("設定同時被修改，請重試。", 409)); return apiError(error); }
});
