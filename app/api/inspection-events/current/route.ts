import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { currentInspectionEvent } from "@/lib/inspection-events/service";

export async function GET() {
  try {
    await requireActor();
    return Response.json({ event: await currentInspectionEvent() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
