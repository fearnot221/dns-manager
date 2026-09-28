import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { restoreDnsChange } from "@/lib/dns-changes/service";
export const POST = auditMutation(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    assertSameOrigin(request);
    return Response.json(await restoreDnsChange(await requireActor(), (await params).id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
});
