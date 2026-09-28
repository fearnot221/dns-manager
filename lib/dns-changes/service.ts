import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { canDeleteRecord } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { connectionScope } from "@/lib/inventory/service";
import { lockActiveUser } from "@/lib/units/service";
import { lockDnsZone } from "./lock";
import { changeSnapshot, dnsChangeActions, snapshotKey } from "./snapshot";

function requireAdmin(actor: Actor) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以管理 DNS 變更紀錄。", 403);
  if (!process.env.DATABASE_URL) throw new ApiError("DNS 變更紀錄需要資料庫。", 503);
}
export async function listDnsChanges(actor: Actor, page: number) {
  requireAdmin(actor);
  const scope = await connectionScope();
  const where = { success: true, action: { in: dnsChangeActions } };
  const [events, total] = await db.$transaction([
    db.auditLog.findMany({ where, include: { user: { select: { name: true, studentId: true } }, dnsRestore: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
  ]);
  return { page, total, events: events.map((event) => {
    const snapshot = changeSnapshot(event);
    const deletes = snapshot?.after?.records.some((r) => !snapshot.before?.records.some((before) => before.content === r.content));
    const reason = event.dnsRestore?.completedAt ? "已復原" : !snapshot ? "缺少完整且可還原的快照" : !event.zone || !event.dnsScope ? "舊紀錄未記錄 DNS 連線來源" : event.dnsScope !== scope ? "DNS 連線來源已變更" : deletes && !canDeleteRecord(actor, event.zone, snapshot.type, snapshot.name) ? "目前權限無法復原受保護紀錄" : "";
    return { id: event.id, createdAt: event.createdAt, zone: event.zone, name: snapshot?.name ?? event.recordName, type: snapshot?.type ?? event.recordType, operation: snapshot?.operation ?? (event.action === "DELETE_RECORD" ? "DELETE" : event.action === "UPDATE_RECORD" ? "UPDATE" : "CREATE"), userName: event.user?.name, studentId: event.user?.studentId, snapshotAvailable: !!snapshot, before: snapshot?.before ?? null, after: snapshot?.after ?? null, canRestore: !reason, reason, pending: !!event.dnsRestore && !event.dnsRestore.completedAt };
  }) };
}

export async function restoreDnsChange(actor: Actor, id: string) {
  requireAdmin(actor);
  // Persist an intent before contacting PowerDNS. A failed response can be retried safely.
  await db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    await tx.$queryRaw`SELECT "id" FROM "AuditLog" WHERE "id" = ${id} FOR UPDATE`;
    const event = await tx.auditLog.findUnique({ where: { id }, include: { dnsRestore: true } });
    if (!event?.success || !dnsChangeActions.includes(event.action)) throw new ApiError("找不到可復原的 DNS 變更。", 404);
    if (event.dnsRestore?.completedAt) throw new ApiError("此變更已復原。", 409);
    const snapshot = changeSnapshot(event);
    if (!snapshot || !event.zone || !event.dnsScope || event.dnsScope !== await connectionScope()) throw new ApiError("此紀錄的快照或 DNS 連線來源無法確認，不能復原。", 409);
    if (snapshot.after?.records.some((r) => !snapshot.before?.records.some((b) => b.content === r.content)) && !canDeleteRecord(actor, event.zone, snapshot.type, snapshot.name)) throw new ApiError("目前權限無法復原受保護紀錄。", 403);
    if (!event.dnsRestore) {
      const zone = await powerdns.getZone(event.zone);
      const current = zone.rrsets.find((r) => r.name === snapshot.name && r.type === snapshot.type) ?? null;
      if (snapshotKey(current) !== snapshotKey(snapshot.after)) throw new ApiError("DNS 已有後續變更，不能覆蓋；請重新整理並確認目前紀錄。", 409);
      await tx.dnsChangeRestore.create({ data: { auditId: id, requestedBy: actor.id } });
    }
  }, { timeout: 30000 });
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { globalRole: true } });
    if (!["ADMIN", "SUPER_ADMIN"].includes(user.globalRole)) throw new ApiError("管理權限已變更。", 403);
    await tx.$queryRaw`SELECT "auditId" FROM "DnsChangeRestore" WHERE "auditId" = ${id} FOR UPDATE`;
    const intent = await tx.dnsChangeRestore.findUniqueOrThrow({ where: { auditId: id }, include: { audit: true } });
    if (intent.completedAt) throw new ApiError("此變更已復原。", 409);
    const event = intent.audit;
    const snapshot = changeSnapshot(event);
    if (!snapshot || event.dnsScope !== await connectionScope()) throw new ApiError("DNS 連線來源已變更。", 409);
    if (snapshot.after?.records.some((r) => !snapshot.before?.records.some((b) => b.content === r.content)) && !canDeleteRecord({ ...actor, globalRole: user.globalRole }, event.zone, snapshot.type, snapshot.name)) throw new ApiError("目前權限無法復原受保護紀錄。", 403);
    await lockDnsZone(tx, event.zone, event.dnsScope!);
    const zone = await powerdns.getZone(event.zone);
    const current = zone.rrsets.find((r) => r.name === snapshot.name && r.type === snapshot.type) ?? null;
    if (snapshotKey(current) === snapshotKey(snapshot.after)) {
      if (snapshot.before) await powerdns.replaceRRSet(event.zone, snapshot.before);
      else await powerdns.deleteRRSet(event.zone, snapshot.name, snapshot.type);
    } else if (snapshotKey(current) !== snapshotKey(snapshot.before)) {
      throw new ApiError("DNS 已有後續變更，不能覆蓋；請重新整理並確認目前紀錄。", 409);
    }
    await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: event.zone, recordName: snapshot.name, recordType: snapshot.type, action: "RESTORE_DNS_CHANGE", dnsScope: event.dnsScope, success: true, oldValue: snapshot.after ? snapshot.after as unknown as Prisma.InputJsonValue : Prisma.JsonNull, newValue: { sourceAuditId: id, rrset: snapshot.before } as unknown as Prisma.InputJsonValue } });
    await tx.dnsChangeRestore.update({ where: { auditId: id }, data: { completedAt: new Date() } });
    return { restored: true };
  }, { timeout: 30000 });
}
