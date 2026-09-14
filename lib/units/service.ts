import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import type { Actor } from "@/lib/dns/types";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { canSubmitUnitRequest, type UnitRole, wouldRemoveLastAdmin } from "./policy";
import { newPasscode, passcodeHash } from "./passcode";
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
  if (isGlobalAdmin(actor)) return "ADMIN" as const;
  if (!member || (level === "edit" && !canSubmitUnitRequest(member.role)) || (level === "manage" && member.role !== "ADMIN")) throw new ApiError("找不到可存取的單位，或單位角色不足。", 403);
  return member.role;
}
export async function unitAudit(tx: Prisma.TransactionClient, actor: Actor, action: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: "", action, success: true, oldValue: before == null ? Prisma.JsonNull : redactAudit(before) as Prisma.InputJsonValue, newValue: after == null ? Prisma.JsonNull : redactAudit(after) as Prisma.InputJsonValue } });
}
export async function listUnits(actor: Actor) {
  requireUnitDatabase();
  const units = await db.dnsUnit.findMany({ where: isGlobalAdmin(actor) ? {} : { members: { some: { userId: actor.id } } }, select: { id: true, name: true, members: { where: { userId: actor.id }, select: { role: true } }, _count: { select: { members: true } } }, orderBy: { name: "asc" } });
  return units.map((unit) => ({ id: unit.id, name: unit.name, role: isGlobalAdmin(actor) ? "ADMIN" : unit.members[0].role, memberCount: unit._count.members }));
}
export async function createUnit(actor: Actor, name: string) {
  requireUnitDatabase();
  const passcode = newPasscode();
  try {
    const unit = await db.$transaction(async (tx) => {
      await lockActiveUser(tx, actor.id);
      const unit = await tx.dnsUnit.create({ data: { name, passcodeHash: passcodeHash(passcode), members: { create: { userId: actor.id, role: "ADMIN" } } }, select: { id: true, name: true } });
      await unitAudit(tx, actor, "CREATE_DNS_UNIT", null, { ...unit, creatorId: actor.id });
      return unit;
    });
    return { unit, passcode };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("此單位名稱已存在，請向該單位管理員取得加入碼，或使用不同名稱。", 409);
    throw error;
  }
}
export async function joinUnit(actor: Actor, passcode: string) {
  requireUnitDatabase();
  const hash = passcodeHash(passcode);
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    const unit = await tx.dnsUnit.findUnique({ where: { passcodeHash: hash }, select: { id: true, name: true } });
    if (!unit) throw new ApiError("加入碼無效或已重設，請向單位管理員索取。", 400);
    await lockUnit(tx, unit.id);
    // Recheck after acquiring the same lock used by rotation/removal.
    const current = await tx.dnsUnit.findUnique({ where: { id: unit.id }, select: { passcodeHash: true } });
    if (current?.passcodeHash !== hash) throw new ApiError("加入碼已重設，請重新索取。", 409);
    await tx.unitMember.upsert({ where: { unitId_userId: { unitId: unit.id, userId: actor.id } }, create: { unitId: unit.id, userId: actor.id, role: "VIEWER" }, update: {} });
    await unitAudit(tx, actor, "JOIN_DNS_UNIT", null, { unitId: unit.id, userId: actor.id });
    return { unit };
  });
}
export async function manageUnit(actor: Actor, id: string, input: { action: "rotate" } | { action: "member"; userId: string; role: UnitRole | null }) {
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    await lockUnit(tx, id);
    await unitAccess(actor, id, "manage", tx);
    if (input.action === "rotate") {
      const passcode = newPasscode();
      await tx.dnsUnit.update({ where: { id }, data: { passcodeHash: passcodeHash(passcode) } });
      await unitAudit(tx, actor, "ROTATE_UNIT_PASSCODE", { unitId: id }, { unitId: id, rotated: true });
      return { passcode };
    }
    const where = { unitId_userId: { unitId: id, userId: input.userId } };
    const before = await tx.unitMember.findUnique({ where });
    if (!before) throw new ApiError("此成員已不在單位內，請重新載入。", 404);
    const targetUser = await tx.user.findUnique({ where: { id: input.userId }, select: { disabled: true } });
    const count = await tx.unitMember.count({ where: { unitId: id, role: "ADMIN", user: { disabled: false } } });
    if (!targetUser?.disabled && wouldRemoveLastAdmin(before.role, input.role, count)) throw new ApiError("必須保留至少一位可登入的單位管理員。", 409);
    if (input.role === "ADMIN" && targetUser?.disabled !== false) throw new ApiError("停用帳號不可指派為單位管理員。", 400);
    const after = input.role ? await tx.unitMember.update({ where, data: { role: input.role } }) : (await tx.unitMember.delete({ where }), null);
    // A removed member must not be able to rejoin with the previously distributed code.
    if (!input.role) await tx.dnsUnit.update({ where: { id }, data: { passcodeHash: passcodeHash(newPasscode()) } });
    await unitAudit(tx, actor, "MANAGE_UNIT_MEMBER", { unitId: id, userId: input.userId, role: before.role }, { unitId: id, userId: input.userId, role: after?.role ?? null, passcodeRotated: !input.role });
    return { saved: true };
  });
}
