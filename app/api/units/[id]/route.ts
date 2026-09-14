import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { manageUnit } from "@/lib/units/service";
import { unitDetail } from "@/lib/units/records";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate") }).strict(),
  z.object({ action: z.literal("member"), userId: z.string().min(1).max(100), role: z.enum(["VIEWER", "EDITOR", "ADMIN"]).nullable() }).strict(),
]);
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { return Response.json(await unitDetail(await requireActor(), (await params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export const PATCH = auditMutation(async (request: Request, { params }: Context) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    return Response.json(await manageUnit(actor, (await params).id, schema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
