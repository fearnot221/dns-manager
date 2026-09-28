import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { createUnit, listUnits } from "@/lib/units/service";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { ApiError } from "@/lib/api/respond";

const schema =
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(100), managerStudentId: z.string().trim().min(1).max(100) }).strict();
export async function GET() {
  try { return Response.json({ units: await listUnits(await requireActor()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export const POST = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    const input = schema.parse(await request.json());
    if (input.action === "create" && !isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以建立單位。", 403);
    const result = await createUnit(actor, input.name, input.managerStudentId);
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
