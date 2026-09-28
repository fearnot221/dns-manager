import { z } from "zod";
import { requestOwnershipSchema } from "@/lib/validation/api";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { requestUnitChange } from "@/lib/units/records";
const common = { recordId: z.string().min(1).max(100), purpose: z.string().trim().min(1).max(1000), expectedHash: z.string().min(10).max(100) };
const schema = z.union([
  z.object({ ...common, operation: z.literal("UPDATE").optional(), ownership: requestOwnershipSchema.optional(), content: z.string().min(1).max(65535) }).strict(),
  z.object({ ...common, operation: z.literal("DELETE") }).strict(),
]);
export const POST = auditMutation(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    assertSameOrigin(request);
    return Response.json(await requestUnitChange(await requireActor(), (await params).id, schema.parse(await request.json())), { status: 201 });
  } catch (error) { return apiError(error); }
});
