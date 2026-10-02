import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import type { Actor, RRSet } from "@/lib/dns/types";
import { accountOwnerIdentifier, isGlobalAdmin, isOwner, OWNER_IDENTIFIER } from "@/lib/auth/owner";
import { canSubmitUnitRequest, type UnitRole, wouldRemoveLastAdmin } from "./policy";

import { powerdns } from "@/lib/powerdns/client";
import { PowerDNSError } from "@/lib/powerdns/errors";
import { connectionScope, recordId } from "@/lib/inventory/service";
import { lockDnsZone } from "@/lib/dns/lock";
import { redactAudit } from "@/lib/audit/redact";

export function requireUnitDatabase() {
  if (!process.env.DATABASE_URL) throw new ApiError("單位功能需要資料庫，請在已完成資料庫設定的環境使用。", 503);
}
export async function lockActiveUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id }, select: { disabled: true, removedAt: true } });
  if (!user || user.disabled || user.removedAt) throw new ApiError("此帳號已停用或移除。", 403);
}
export async function lockUnit(tx: Prisma.TransactionClient, id: string) {
  const found = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DnsUnit" WHERE "id" = ${id} FOR UPDATE`;
  if (!found.length) throw new ApiError("找不到單位。", 404);
}
export async function unitAccess(actor: Actor, id: string, level: "view" | "edit" | "manage", tx: Prisma.TransactionClient = db) {
  const member = await tx.unitMember.findUnique({ where: { unitId_userId: { unitId: id, userId: actor.id } } });
  if (level !== "view") await requireActiveUnit(tx, id);
  if (isGlobalAdmin(actor) && level !== "edit") return "ADMIN" as const;
  if (!member || (level === "edit" && !canSubmitUnitRequest(member.role)) || (level === "manage" && member.role !== "ADMIN")) throw new ApiError("找不到可存取的單位，或單位角色不足。", 403);
  return member.role;
}
export async function requireActiveUnit(tx: Prisma.TransactionClient, id: string) {
  const unit = await tx.dnsUnit.findUnique({ where: { id }, select: { status: true } });
  if (unit?.status !== "APPROVED") throw new ApiError("此單位未啟用，無法使用。", 403);
}
export async function unitAudit(tx: Prisma.TransactionClient, actor: Actor, action: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: "", action, success: true, oldValue: before == null ? Prisma.JsonNull : redactAudit(before) as Prisma.InputJsonValue, newValue: after == null ? Prisma.JsonNull : redactAudit(after) as Prisma.InputJsonValue } });
}
export async function listUnits(actor: Actor) {
  requireUnitDatabase();
  const units = await db.dnsUnit.findMany({ where: isGlobalAdmin(actor) ? {} : { members: { some: { userId: actor.id } } }, select: { id: true, name: true, status: true, members: { where: { userId: actor.id }, select: { role: true } }, _count: { select: { members: true } } }, orderBy: { name: "asc" } });
  return units.map((unit) => ({ id: unit.id, name: unit.name, status: unit.status, canApply: unit.status === "APPROVED" && canSubmitUnitRequest(unit.members[0]?.role), role: isGlobalAdmin(actor) ? "ADMIN" : unit.members[0].role, memberCount: unit._count.members }));
}
function requireUnitCreator(actor: Actor) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以建立單位或透過學號指定管理人。", 403);
}
async function resolveUnitManager(tx: Prisma.TransactionClient, studentId: string) {
  const users = await tx.user.findMany({ where: { studentId: studentId.trim(), removedAt: null }, select: { id: true }, take: 2 });
  if (!users.length) throw new ApiError("找不到此學號的已註冊使用者，請先請管理人登入註冊。", 404);
  if (users.length !== 1) throw new ApiError("此學號對應多個帳號，請先確認帳號資料後再指派。", 409);
  return users[0].id;
}
// Recheck stored privileges while retaining the verified Logto owner's resolved role.
export async function isCurrentUnitAdmin(tx: Prisma.TransactionClient, actor: Actor) {
  const current = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: {
    globalRole: true, logtoName: true, accounts: { where: { provider: "logto" }, select: { provider: true, providerAccountId: true } },
  } });
  return isGlobalAdmin({ ...actor, globalRole: current.globalRole }) ||
    (isOwner(actor) && accountOwnerIdentifier(current.accounts, current.globalRole, current.logtoName) === OWNER_IDENTIFIER);
}
async function lockManagerAndActor(tx: Prisma.TransactionClient, actor: Actor, userId: string, studentId: string) {
  for (const id of [...new Set([actor.id, userId])].sort()) await lockActiveUser(tx, id);
  if (!await isCurrentUnitAdmin(tx, actor)) throw new ApiError("只有系統管理員可以建立單位或指定管理人。", 403);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { studentId: true } });
  if (user?.studentId !== studentId.trim()) throw new ApiError("管理人的學號資料已更新，請重新確認。", 409);
}
export async function createUnit(actor: Actor, name: string, managerStudentId?: string) {
  requireUnitCreator(actor);
  requireUnitDatabase();
  try {
    const unit = await db.$transaction(async (tx) => {
      const studentId = managerStudentId?.trim() || null;
      const managerId = studentId ? await resolveUnitManager(tx, studentId) : null;
      if (managerId && studentId) await lockManagerAndActor(tx, actor, managerId, studentId);
      else {
        await lockActiveUser(tx, actor.id);
        if (!await isCurrentUnitAdmin(tx, actor)) throw new ApiError("只有系統管理員可以建立單位。", 403);
      }
      const unit = await tx.dnsUnit.create({ data: { name, status: "APPROVED", ...(managerId && studentId ? { allowlist: { create: { studentId, userId: managerId } }, members: { create: { userId: managerId, role: "ADMIN" as const } } } : {}) }, select: { id: true, name: true, status: true } });
      await unitAudit(tx, actor, "CREATE_DNS_UNIT", null, { ...unit, creatorId: actor.id, managerId, managerStudentId: studentId });
      return unit;
    });
    return { unit };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("此單位名稱已存在，請聯絡該單位管理員，或使用不同名稱。", 409);
    throw error;
  }
}
export async function assignUnitManager(actor: Actor, id: string, studentId: string) {
  requireUnitCreator(actor);
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    const userId = await resolveUnitManager(tx, studentId);
    await lockManagerAndActor(tx, actor, userId, studentId);
    await lockUnit(tx, id);
    const where = { unitId_userId: { unitId: id, userId } };
    const before = await tx.unitMember.findUnique({ where });
    await tx.unitMember.upsert({ where, create: { unitId: id, userId, role: "ADMIN" }, update: { role: "ADMIN" } });
    await tx.unitAllowlist.upsert({ where: { unitId_studentId: { unitId: id, studentId: studentId.trim() } }, create: { unitId: id, studentId: studentId.trim(), userId }, update: { userId } });
    await unitAudit(tx, actor, "ASSIGN_UNIT_MANAGER", { unitId: id, userId, role: before?.role ?? null }, { unitId: id, userId, studentId: studentId.trim(), role: "ADMIN" });
    return { saved: true };
  });
}
export async function manageUnit(actor: Actor, id: string, input: { action: "member"; userId: string; role: UnitRole | null }) {
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    const systemAdmin = isGlobalAdmin(actor);
    if (systemAdmin && !await isCurrentUnitAdmin(tx, actor)) throw new ApiError("系統管理員權限已變更，請重新登入。", 403);
    await lockUnit(tx, id);
    await unitAccess(actor, id, "manage", tx);
    const where = { unitId_userId: { unitId: id, userId: input.userId } };
    const before = await tx.unitMember.findUnique({ where });
    if (!before) throw new ApiError("此成員已不在單位內，請重新載入。", 404);
    const targetUser = await tx.user.findUnique({ where: { id: input.userId }, select: { disabled: true, studentId: true } });
    const count = await tx.unitMember.count({ where: { unitId: id, role: "ADMIN", user: { disabled: false } } });
    if (!(systemAdmin && input.role === null) && !targetUser?.disabled && wouldRemoveLastAdmin(before.role, input.role, count)) throw new ApiError("必須保留至少一位可登入的單位管理員。", 409);
    if (input.role === "ADMIN" && targetUser?.disabled !== false) throw new ApiError("停用帳號不可指派為單位管理員。", 400);
    const after = input.role ? await tx.unitMember.update({ where, data: { role: input.role } }) : (await tx.unitMember.delete({ where }), null);
    if (!input.role) await tx.unitAllowlist.deleteMany({ where: { unitId: id, OR: [{ userId: input.userId }, ...(targetUser?.studentId ? [{ studentId: targetUser.studentId, userId: null }] : [])] } });
    await unitAudit(tx, actor, "MANAGE_UNIT_MEMBER", { unitId: id, userId: input.userId, role: before.role }, { unitId: id, userId: input.userId, role: after?.role ?? null, allowlistRevoked: !input.role });
    return { saved: true };
  });
}

export async function editUnit(actor: Actor, id: string, input: { action: "rename"; name: string } | { action: "delete" }) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以修改或刪除單位。", 403);
  requireUnitDatabase();
  if (input.action === "rename" && (!input.name.trim() || input.name.trim().length > 100)) throw new ApiError("單位名稱須為 1–100 字。", 400);
  try {
    return await db.$transaction(async (tx) => {
      await lockActiveUser(tx, actor.id);
      if (!await isCurrentUnitAdmin(tx, actor)) throw new ApiError("只有系統管理員可以修改或刪除單位。", 403);
      await lockUnit(tx, id);
      const before = await tx.dnsUnit.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
      if (input.action === "rename") {
        const unit = await tx.dnsUnit.update({ where: { id }, data: { name: input.name.trim() }, select: { id: true, name: true } });
        await tx.dnsRecordMetadata.updateMany({ where: { unitId: id }, data: { applicantUnit: unit.name, updatedBy: actor.email } });
        await unitAudit(tx, actor, "RENAME_DNS_UNIT", before, unit);
        return { saved: true };
      }
      const memberCount = await tx.unitMember.count({ where: { unitId: id } });
      if (memberCount) throw new ApiError(`此單位仍有 ${memberCount} 位成員，請先移除所有成員後再刪除單位。`, 409);
      // Closed requests and retired inspection notifications are history, not active dependencies.
      const pending = await tx.dnsRecordRequest.count({ where: { unitId: id, status: "PENDING" } });
      if (pending) throw new ApiError(`此單位仍有 ${pending} 筆待審核申請，請先完成審核後再刪除。`, 409);
      const records = await tx.dnsRecordMetadata.findMany({ where: { unitId: id } });
      if (records.length) {
        const scope = await connectionScope();
        if (records.some((record) => record.id !== recordId(scope, record))) throw new ApiError("此單位有其他 DNS 連線來源的歸屬資料，無法確認是否已刪除，請先確認歸屬。", 409);
        // The same locks guard direct edits and approvals, so a value cannot reappear during this check.
        for (const zoneName of [...new Set(records.map((record) => record.zoneName))].sort()) {
          await lockDnsZone(tx, zoneName, scope);
          let rrsets: RRSet[];
          try { rrsets = (await powerdns.getZone(zoneName)).rrsets; }
          catch (error) {
            if (error instanceof PowerDNSError && error.status === 404) rrsets = [];
            else throw new ApiError("暫時無法確認此單位的 DNS 狀態，未刪除單位，請稍後重試。", 503);
          }
          const live = records.some((record) => record.zoneName === zoneName && rrsets.some((rrset) => rrset.name === record.recordName && rrset.type === record.recordType && rrset.records.some((value) => value.content === record.content)));
          if (live) throw new ApiError("此單位仍有 DNS 解析值，請先刪除或重新指派歸屬後再刪除單位。", 409);
        }
      }
      const linked = await tx.dnsUnit.findUniqueOrThrow({ where: { id }, select: { _count: { select: { members: true, allowlist: true } } } });
      const requests = await tx.dnsRecordRequest.findMany({ where: { unitId: id }, select: { id: true } });
      const tasks = await tx.inspectionTask.findMany({ where: { unitId: id }, select: { id: true } });
      // Retain every historical row and snapshot; only detach the FK to the unit being removed.
      await tx.dnsRecordMetadata.updateMany({ where: { unitId: id }, data: { unitId: null } });
      await tx.dnsRecordRequest.updateMany({ where: { unitId: id, OR: [{ applicantUnit: null }, { applicantUnit: "" }] }, data: { applicantUnit: before.name } });
      await tx.dnsRecordRequest.updateMany({ where: { unitId: id }, data: { unitId: null } });
      await tx.inspectionTask.updateMany({ where: { unitId: id }, data: { unitId: null, archivedUnitId: id, archivedUnitName: before.name } });
      await tx.dnsUnit.delete({ where: { id } });
      await unitAudit(tx, actor, "DELETE_DNS_UNIT", { ...before, ...linked._count, recordIds: records.map((record) => record.id), requestIds: requests.map((request) => request.id), inspectionTaskIds: tasks.map((task) => task.id) }, null);
      return { saved: true };
    }, { timeout: 60000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("此單位名稱已存在，請使用不同名稱。", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ApiError("此單位仍有資料關聯，無法刪除。", 409);
    throw error;
  }
}
