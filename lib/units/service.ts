import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import type { Actor } from "@/lib/dns/types";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { canSubmitUnitRequest, type UnitRole, wouldRemoveLastAdmin } from "./policy";

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
async function lockManagerAndActor(tx: Prisma.TransactionClient, actor: Actor, userId: string, studentId: string) {
  for (const id of [...new Set([actor.id, userId])].sort()) await lockActiveUser(tx, id);
  const currentActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { globalRole: true } });
  if (!["ADMIN", "SUPER_ADMIN"].includes(currentActor.globalRole)) throw new ApiError("只有系統管理員可以建立單位或指定管理人。", 403);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { studentId: true } });
  if (user?.studentId !== studentId.trim()) throw new ApiError("管理人的學號資料已更新，請重新確認。", 409);
}
export async function createUnit(actor: Actor, name: string, managerStudentId: string) {
  requireUnitCreator(actor);
  requireUnitDatabase();
  try {
    const unit = await db.$transaction(async (tx) => {
      const managerId = await resolveUnitManager(tx, managerStudentId);
      await lockManagerAndActor(tx, actor, managerId, managerStudentId);
      const unit = await tx.dnsUnit.create({ data: { name, status: "APPROVED", allowlist: { create: { studentId: managerStudentId.trim(), userId: managerId } }, members: { create: { userId: managerId, role: "ADMIN" } } }, select: { id: true, name: true, status: true } });
      await unitAudit(tx, actor, "CREATE_DNS_UNIT", null, { ...unit, creatorId: actor.id, managerId, managerStudentId: managerStudentId.trim() });
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
    await lockUnit(tx, id);
    await unitAccess(actor, id, "manage", tx);
    const where = { unitId_userId: { unitId: id, userId: input.userId } };
    const before = await tx.unitMember.findUnique({ where });
    if (!before) throw new ApiError("此成員已不在單位內，請重新載入。", 404);
    const targetUser = await tx.user.findUnique({ where: { id: input.userId }, select: { disabled: true, studentId: true } });
    const count = await tx.unitMember.count({ where: { unitId: id, role: "ADMIN", user: { disabled: false } } });
    if (!targetUser?.disabled && wouldRemoveLastAdmin(before.role, input.role, count)) throw new ApiError("必須保留至少一位可登入的單位管理員。", 409);
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
      const current = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { globalRole: true } });
      if (!["ADMIN", "SUPER_ADMIN"].includes(current.globalRole)) throw new ApiError("只有系統管理員可以修改或刪除單位。", 403);
      await lockUnit(tx, id);
      const before = await tx.dnsUnit.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
      if (input.action === "rename") {
        const unit = await tx.dnsUnit.update({ where: { id }, data: { name: input.name.trim() }, select: { id: true, name: true } });
        await tx.dnsRecordMetadata.updateMany({ where: { unitId: id }, data: { applicantUnit: unit.name, updatedBy: actor.email } });
        await unitAudit(tx, actor, "RENAME_DNS_UNIT", before, unit);
        return { saved: true };
      }
      const linked = await tx.dnsUnit.findUniqueOrThrow({ where: { id }, select: { _count: { select: { records: true, requests: true, inspectionTasks: true, members: true, allowlist: true } } } });
      const counts = linked._count;
      if (counts.records || counts.requests || counts.inspectionTasks) throw new ApiError("此單位仍有 DNS、申請紀錄或清查任務關聯，無法刪除。", 409);
      await tx.dnsUnit.delete({ where: { id } });
      await unitAudit(tx, actor, "DELETE_DNS_UNIT", { ...before, members: counts.members, allowlist: counts.allowlist }, null);
      return { saved: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("此單位名稱已存在，請使用不同名稱。", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ApiError("此單位仍有資料關聯，無法刪除。", 409);
    throw error;
  }
}
