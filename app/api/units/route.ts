import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { createUnit, joinUnit, listUnits } from "@/lib/units/service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("join"), passcode: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/) }).strict(),
]);
export async function GET() {
  try { return Response.json({ units: await listUnits(await requireActor()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export const POST = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    const input = schema.parse(await request.json());
    const result = input.action === "create" ? await createUnit(actor, input.name) : await joinUnit(actor, input.passcode);
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
