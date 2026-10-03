import { requireActor } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/api/security";
import { apiError } from "@/lib/api/respond";
import { auditMutation } from "@/lib/audit/mutation";
import { eventFields, eventUpdate, eventDelete, taipeiDate } from "@/lib/inspection-events/model";
import { changeInspectionEvent, listInspectionEvents, requireEventAdmin } from "@/lib/inspection-events/service";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const actor = await requireActor();
    return Response.json({ events: await listInspectionEvents(actor), today: taipeiDate() }, { headers });
  } catch (error) { return apiError(error); }
}

function mutation(method: "POST" | "PATCH" | "DELETE") {
  return auditMutation(async (request: Request) => {
    try {
      assertSameOrigin(request);
      const actor = await requireActor();
      requireEventAdmin(actor);
      const body = await request.json();
      const change = method === "POST" ? { kind: "create" as const, event: eventFields.parse(body) }
        : method === "PATCH" ? { kind: "update" as const, ...eventUpdate.parse(body) }
          : { kind: "delete" as const, ...eventDelete.parse(body) };
      return Response.json({ event: await changeInspectionEvent(actor, change) }, { status: method === "POST" ? 201 : 200, headers });
    } catch (error) { return apiError(error); }
  });
}

export const POST = mutation("POST");
export const PATCH = mutation("PATCH");
export const DELETE = mutation("DELETE");
