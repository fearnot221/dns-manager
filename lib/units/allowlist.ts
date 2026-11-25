import "server-only";
import { z } from "zod";
import { enqueueUnitOpenedMail } from "@/lib/mail/queue";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { isCurrentUnitAdmin, lockActiveUser, lockUnit, requireUnitDatabase, unitAccess, unitAudit } from "./service";

export async function manageAllowlist(actor: Actor, unitId: string, rawStudentId: string, remove = false, notificationEmail?: string) {
  requireUnitDatabase();
  const studentId = rawStudentId.trim();
  if (!studentId || studentId.length > 100) throw new ApiError("請輸入有效學號。", 400);
  if (notificationEmail !== undefined) notificationEmail = z.email().max(254).parse(notificationEmail.trim());
  if (remove && notificationEmail) throw new ApiError("移除使用者時不可寄送開通通知。", 400);
  // Authorize before looking up a student; repeat under the unit lock.
  await unitAccess(actor, unitId, "manage");
  return db.$transaction(async (tx) => {
    const candidates = remove ? [] : await tx.user.findMany({ where: { studentId, removedAt: null }, select: { id: true }, take: 2 });
    if (candidates.length > 1) throw new ApiError("此學號對應多個帳號，請先確認帳號資料。", 409);
    for (const id of [...new Set([actor.id, ...candidates.map((u) => u.id)])].sort()) await lockActiveUser(tx, id);
    const systemAdmin = isGlobalAdmin(actor);
    if (systemAdmin && !await isCurrentUnitAdmin(tx, actor)) throw new ApiError("系統管理員權限已變更，請重新登入。", 403);
    await lockUnit(tx, unitId);
    await unitAccess(actor, unitId, "manage", tx);
    const where = { unitId_studentId: { unitId, studentId } };
    const before = await tx.unitAllowlist.findUnique({ where });
    let notificationQueued: number | undefined;
    if (remove) {
      if (before?.userId) {
        const member = await tx.unitMember.findUnique({ where: { unitId_userId: { unitId, userId: before.userId } }, include: { user: true } });
        if (!systemAdmin && member?.role === "ADMIN" && !member.user.disabled && !member.user.removedAt && await tx.unitMember.count({ where: { unitId, role: "ADMIN", user: { disabled: false, removedAt: null } } }) <= 1) throw new ApiError("必須保留至少一位可登入的單位管理員。", 409);
        await tx.unitMember.deleteMany({ where: { unitId, userId: before.userId } });
        await tx.unitAllowlist.deleteMany({ where: { unitId, userId: before.userId } });
      }
      await tx.unitAllowlist.deleteMany({ where: { unitId, studentId } });
    } else {
      const current = await tx.user.findMany({ where: { studentId, removedAt: null }, select: { id: true }, take: 2 });
      if (current.length !== candidates.length || current[0]?.id !== candidates[0]?.id) throw new ApiError("學號資料已更新，請重新確認。", 409);
      const userId = candidates[0]?.id ?? null;
      if (before?.userId && before.userId !== userId) throw new ApiError("此學號已對應其他帳號，請先移除原使用者再重新新增。", 409);
      const entry = await tx.unitAllowlist.upsert({ where, create: { unitId, studentId, userId }, update: { userId } });
      if (userId) await tx.unitMember.upsert({ where: { unitId_userId: { unitId, userId } }, create: { unitId, userId, role: "EDITOR" }, update: {} });
      if (notificationEmail) {
        const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: unitId }, select: { name: true } });
        notificationQueued = await enqueueUnitOpenedMail(tx, JSON.stringify([entry.unitId, entry.studentId, entry.createdAt.toISOString()]), notificationEmail, { studentId, unitName: unit.name });
      }
    }
    await unitAudit(tx, actor, remove ? "REMOVE_UNIT_ALLOWLIST" : "ADD_UNIT_ALLOWLIST", before, { unitId, studentId, removed: remove, ...(notificationEmail ? { notificationEmail, notificationQueued } : {}) });
    return { saved: true, ...(notificationQueued === undefined ? {} : { notificationQueued }) };
  });
}
