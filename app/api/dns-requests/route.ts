import { auditMutation } from "@/lib/audit/mutation";
import { powerdns } from "@/lib/powerdns/client";
import { ApplicationInputError, prepareApplication } from "@/lib/requests/application";
import { saveApplication } from "@/lib/requests/save-application";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiError, ApiError } from "@/lib/api/respond";
import { logAuditEvent } from "@/lib/audit/service";
import { isDevRequestStore, listDevRequests } from "@/lib/requests/dev-store";

export async function GET() {
  try {
    const actor = await requireActor();
    const managedZones = Object.entries(actor.zoneRoles).filter(([, role]) => role === "ADMIN").map(([zone]) => zone);
    const isSuperAdmin = actor.globalRole === "SUPER_ADMIN" || actor.globalRole === "ADMIN";
    if (isDevRequestStore()) {
      const requests = listDevRequests(actor);
      return Response.json({
        scope: isSuperAdmin || managedZones.length ? "ADMIN" : "USER",
        requests: requests.map((item) => ({
          ...item,
          canReview: item.status === "PENDING" && (isSuperAdmin || managedZones.includes(item.zoneName)),
        })),
      });
    }
    const where = isSuperAdmin
      ? {}
      : managedZones.length
        ? { OR: [{ userId: actor.id }, { zoneName: { in: managedZones } }] }
        : { userId: actor.id };
    const requests = await db.dnsRecordRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      scope: isSuperAdmin || managedZones.length ? "ADMIN" : "USER",
      requests: requests.map((item) => ({
        ...item,
        canReview: item.status === "PENDING" && (isSuperAdmin || managedZones.includes(item.zoneName)),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

async function POSTHandler(request: Request) {
  let actor;
  try {
    actor = await requireActor();
    const body = await request.json().catch(() => { throw new ApiError("申請資料格式不正確。", 400); });
    const zones = await powerdns.listZones();
    const input = prepareApplication(body, zones.map((zone) => zone.name));
    const saved = await saveApplication(actor, input, request);
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (actor) await logAuditEvent({ actor, zone: "", action: "REQUEST_DNS_APPLICATION", success: false, errorMessage: error instanceof Error ? error.message : "Unknown error", request }).catch(() => undefined);
    return apiError(error instanceof ApplicationInputError ? new ApiError(error.message, error.status) : error);
  }
}

export const POST = auditMutation(POSTHandler);
