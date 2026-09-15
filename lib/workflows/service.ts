import "server-only";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { lockActiveUser, unitAudit } from "@/lib/units/service";
import { connectionScope, recordId, describeRecords } from "@/lib/inventory/service";
import { powerdns } from "@/lib/powerdns/client";
import { zoneCategory } from "@/lib/dns/zone-category";

export function requireWorkflowDatabase() { if (!process.env.DATABASE_URL) throw new ApiError("此功能需要資料庫，請於正式資料庫環境使用。", 503); }
export const publicUserSelect = { id: true, name: true, studentId: true, email: true, portalEmail: true } as const;
export function publicContact(user: { id: string; name: string | null; studentId: string | null; email: string; portalEmail: string | null }) {
  return { id: user.id, name: user.name, studentId: user.studentId, email: null };
}
export async function sendContact(actor: Actor, input: { subject: string; body: string }) {
  requireWorkflowDatabase();
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    const message = await tx.contactMessage.create({ data: { userId: actor.id, ...input } });
    await unitAudit(tx, actor, "SEND_CONTACT_MESSAGE", null, { id: message.id, ...input });
    return message;
  });
}
export async function replyContact(actor: Actor, id: string, reply: string) {
  requireWorkflowDatabase();
  if (!isGlobalAdmin(actor)) throw new ApiError("僅系統管理員可回覆訊息。", 403);
  return db.$transaction(async (tx) => {
    const updated = await tx.contactMessage.updateMany({ where: { id, repliedAt: null }, data: { reply, repliedBy: actor.id, repliedAt: new Date() } });
    if (!updated.count) throw new ApiError("訊息不存在或已回覆，請重新載入。", 409);
    await unitAudit(tx, actor, "REPLY_CONTACT_MESSAGE", { id, reply: null }, { id, reply });
  });
}
export async function assignInspection(actor: Actor, identity: { zoneName: string; recordName: string; recordType: string; content: string }, userId: string) {
  requireWorkflowDatabase();
  if (!isGlobalAdmin(actor)) throw new ApiError("僅系統管理員可指派使用者清查。", 403);
  if (zoneCategory(identity.zoneName) !== "forward") throw new ApiError("僅一般網域可以清查。", 400);
  const id = recordId(await connectionScope(), identity);
  const zone = await powerdns.getZone(identity.zoneName);
  const live = (await describeRecords(actor, identity.zoneName, zone.rrsets)).find((r) => r.ownership.id === id);
  if (!live) throw new ApiError("DNS 已變更，請重新載入。", 409);
  const snapshot = { zoneName: live.zoneName, recordName: live.recordName, recordType: live.recordType, content: live.content, purpose: live.ownership.purpose, applicantUnit: live.ownership.applicantUnit };
  return db.$transaction(async (tx) => {
    // Serializes assignment against removing the recipient account.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target || target.disabled || target.removedAt) throw new ApiError("請選擇可登入的使用者。", 400);
    const o = live.ownership;
    await tx.dnsRecordMetadata.upsert({ where: { id }, update: {}, create: { id, ...identity, applicantName: o.applicantName, applicantEmail: o.applicantEmail, applicantUnit: o.applicantUnit, applicantExtension: o.applicantExtension, purpose: o.purpose, updatedBy: actor.email } });
    const task = await tx.inspectionTask.create({ data: { recordId: id, userId, createdBy: actor.id, snapshot } });
    await unitAudit(tx, actor, "ASSIGN_DNS_INSPECTION", null, { id: task.id, userId, snapshot });
    return task;
  });
}
export async function respondInspection(actor: Actor, id: string, status: "CONFIRMED" | "ISSUE", response: string) {
  requireWorkflowDatabase();
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    const task = await tx.inspectionTask.findFirst({ where: { id, userId: actor.id, status: "PENDING" }, include: { record: true } });
    if (!task) throw new ApiError("找不到待確認的清查項目。", 404);
    if (task.recordId !== recordId(await connectionScope(), task.record)) throw new ApiError("DNS 連線已更換，請聯絡管理員重新清查。", 409);
    const zone = await powerdns.getZone(task.record.zoneName);
    if (!zone.rrsets.some((r) => r.name === task.record.recordName && r.type === task.record.recordType && r.records.some((value) => value.content === task.record.content))) throw new ApiError("DNS 已變更或移除，請聯絡管理員重新指派。", 409);
    const changed = await tx.inspectionTask.updateMany({ where: { id, userId: actor.id, status: "PENDING" }, data: { status, response, respondedAt: new Date() } });
    if (!changed.count) throw new ApiError("此清查已回覆，請重新載入。", 409);
    await tx.dnsInspection.create({ data: { recordId: task.recordId, inspectorId: actor.id, inspectorEmail: actor.email, inspectorName: actor.name || actor.email, note: `[使用者回覆：${status === "CONFIRMED" ? "確認仍在使用" : "回報問題"}] ${response}` } });
    await unitAudit(tx, actor, "RESPOND_DNS_INSPECTION", { id, status: "PENDING" }, { id, status, response });
  }, { timeout: 30000 });
}
export async function cancelInspection(actor: Actor, id: string) {
  requireWorkflowDatabase();
  if (!isGlobalAdmin(actor)) throw new ApiError("僅系統管理員可撤回清查。", 403);
  await db.$transaction(async (tx) => {
    const result = await tx.inspectionTask.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date(), response: "管理員已撤回" } });
    if (!result.count) throw new ApiError("清查不存在或已處理。", 409);
    await unitAudit(tx, actor, "CANCEL_DNS_INSPECTION", { id, status: "PENDING" }, { id, status: "CANCELLED" });
  });
}
