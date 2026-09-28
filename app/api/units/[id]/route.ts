import { manageAllowlist } from "@/lib/units/allowlist";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { assignUnitManager, manageUnit, reviewUnit } from "@/lib/units/service";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { ApiError } from "@/lib/api/respond";
import { unitDetail } from "@/lib/units/records";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign-manager"), studentId: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("review"), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal("allowlist"), studentId: z.string().trim().min(1).max(100), remove: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("member"), userId: z.string().min(1).max(100), role: z.enum(["VIEWER", "EDITOR", "ADMIN"]).nullable() }).strict(),
]);
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { return Response.json(await unitDetail(await requireActor(), (await params).id, new URL(_request.url).searchParams.get("view") === "manage" ? "manage" : "dns"), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export const PATCH = auditMutation(async (request: Request, { params }: Context) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    const input = schema.parse(await request.json());
    const id = (await params).id;
    if (input.action === "allowlist") return Response.json(await manageAllowlist(actor, id, input.studentId, input.remove ?? false), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "assign-manager") {
      if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以透過學號指定管理人。", 403);
      return Response.json(await assignUnitManager(actor, id, input.studentId), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(input.action === "review" ? await reviewUnit(actor, id, input.decision, input.note) : await manageUnit(actor, id, input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
