import "server-only";
import type { InspectionEvent, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isLocalDemo } from "@/lib/db/local-store";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { eventFields, taipeiDate, type EventFields } from "./model";

export function requireEventAdmin(actor: Actor) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以管理清查活動。", 403);
}

function view(event: InspectionEvent) {
  return { id: event.id, name: event.name, startsOn: event.startsOn.toISOString().slice(0, 10), endsOn: event.endsOn.toISOString().slice(0, 10), revision: event.revision };
}

export async function listInspectionEvents(actor: Actor) {
  requireEventAdmin(actor);
  return (await db.inspectionEvent.findMany({ orderBy: [{ startsOn: "desc" }, { id: "asc" }] })).map(view);
}

export async function currentInspectionEvent(now = new Date()): Promise<EventFields | null> {
  const today = new Date(`${taipeiDate(now)}T00:00:00.000Z`);
  const event = await db.inspectionEvent.findFirst({
    where: { startsOn: { lte: today }, endsOn: { gte: today } },
    select: { name: true, startsOn: true, endsOn: true },
    orderBy: { startsOn: "desc" },
  });
  return event ? { name: event.name, startsOn: event.startsOn.toISOString().slice(0, 10), endsOn: event.endsOn.toISOString().slice(0, 10) } : null;
}

export async function inspectionEventSnapshot(now: Date, tx: Prisma.TransactionClient = db) {
  const today = new Date(`${taipeiDate(now)}T00:00:00.000Z`);
  const event = isLocalDemo() ? null : await tx.inspectionEvent.findFirst({
    where: { startsOn: { lte: today }, endsOn: { gte: today } },
    select: { id: true, name: true }, orderBy: { startsOn: "desc" },
  });
  return { eventId: event?.id ?? null, eventName: event?.name ?? null, eventClassified: true };
}

type Change = { kind: "create"; event: EventFields } | { kind: "update"; id: string; expectedRevision: number; event: EventFields } | { kind: "delete"; id: string; expectedRevision: number };

export async function changeInspectionEvent(actor: Actor, change: Change) {
  requireEventAdmin(actor);
  const fields = change.kind === "delete" ? null : eventFields.parse(change.event);
  return db.$transaction(async (tx) => {
    // Serialize all schedule changes so two concurrent creates cannot overlap.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(61004001)`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: actor.id } });
    if (!user || user.disabled || user.removedAt || !["ADMIN", "SUPER_ADMIN"].includes(user.globalRole)) throw new ApiError("管理權限已變更，請重新登入。", 403);
    const before = change.kind === "create" ? null : await tx.inspectionEvent.findUnique({ where: { id: change.id } });
    if (change.kind !== "create") {
      if (!before) throw new ApiError("找不到清查活動。", 404);
      if (before.revision !== change.expectedRevision) throw new ApiError("清查活動已更新，請重新載入後再試。", 409);
    }
    const dates = fields ? { startsOn: new Date(`${fields.startsOn}T00:00:00.000Z`), endsOn: new Date(`${fields.endsOn}T00:00:00.000Z`) } : null;
    if (dates && await tx.inspectionEvent.findFirst({ where: { ...(before ? { id: { not: before.id } } : {}), startsOn: { lte: dates.endsOn }, endsOn: { gte: dates.startsOn } } })) {
      throw new ApiError("清查期間與其他活動重疊，請調整日期。", 409);
    }
    let after: InspectionEvent | null = null;
    if (change.kind === "delete") await tx.inspectionEvent.delete({ where: { id: change.id } });
    else if (change.kind === "create") after = await tx.inspectionEvent.create({ data: { name: fields!.name, ...dates! } });
    else after = await tx.inspectionEvent.update({ where: { id: change.id }, data: { name: fields!.name, ...dates!, revision: { increment: 1 } } });
    await tx.auditLog.create({ data: {
      userId: actor.id, userEmail: actor.email, zone: "", action: `INSPECTION_EVENT_${change.kind.toUpperCase()}`, success: true,
      ...(before ? { oldValue: view(before) } : {}), ...(after ? { newValue: view(after) } : {}),
    } });
    return after ? view(after) : null;
  });
}
