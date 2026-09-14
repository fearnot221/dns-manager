import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { requestUnitChange } from "@/lib/units/records";
const schema = z.object({ recordId: z.string().min(1).max(100), content: z.string().min(1).max(65535), purpose: z.string().trim().min(1).max(1000), expectedHash: z.string().min(10).max(100) }).strict();
export const POST = auditMutation(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    assertSameOrigin(request);
    return Response.json(await requestUnitChange(await requireActor(), (await params).id, schema.parse(await request.json())), { status: 201 });
  } catch (error) { return apiError(error); }
});
