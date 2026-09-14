import "server-only";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isOwner, OWNER_IDENTIFIER } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { lockUnit, unitAudit } from "@/lib/units/service";
import { newPasscode, passcodeHash } from "@/lib/units/passcode";
export async function removeUser(actor: Actor, id: string) {
  if (!isOwner(actor)) throw new ApiError("此操作需要帳號移除權限。", 403);
  if (!process.env.DATABASE_URL) throw new ApiError("移除使用者需使用資料庫環境。", 503);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id }, include: { accounts: { where: { provider: { in: ["ncu-portal", "logto"] } } }, unitMemberships: { orderBy: { unitId: "asc" } } } });
    if (!user) throw new ApiError("找不到使用者。", 404);
    if (id === actor.id || user.accounts.some((a) => (a.provider === "ncu-portal" && a.providerAccountId === OWNER_IDENTIFIER) || (a.provider === "logto" && !!process.env.LOGTO_OWNER_SUB && a.providerAccountId === process.env.LOGTO_OWNER_SUB))) throw new ApiError("此帳號不能移除。", 403);
    if (user.removedAt) throw new ApiError("此帳號已移除。", 409);
    for (const membership of user.unitMemberships) {
      await lockUnit(tx, membership.unitId);
      if (membership.role === "ADMIN" && await tx.unitMember.count({ where: { unitId: membership.unitId, role: "ADMIN", userId: { not: id }, user: { disabled: false, removedAt: null } } }) === 0) throw new ApiError("此帳號是單位唯一管理員，請先指派其他管理員。", 409);
      await tx.dnsUnit.update({ where: { id: membership.unitId }, data: { passcodeHash: passcodeHash(newPasscode()) } });
    }
    const now = new Date();
    await tx.user.update({ where: { id }, data: { disabled: true, removedAt: now, passwordHash: null, globalRole: "USER" } });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.zonePermission.deleteMany({ where: { userId: id } });
    await tx.groupMember.deleteMany({ where: { userId: id } });
    await tx.unitMember.deleteMany({ where: { userId: id } });
    const cancelled = await tx.dnsRecordRequest.updateMany({ where: { userId: id, status: "PENDING" }, data: { status: "CANCELLED", reviewNote: "申請帳號已移除" } });
    await tx.inspectionTask.updateMany({ where: { userId: id, status: "PENDING" }, data: { status: "CANCELLED", response: "帳號已移除", respondedAt: now } });
    await unitAudit(tx, actor, "REMOVE_USER", { id, disabled: user.disabled, globalRole: user.globalRole, units: user.unitMemberships.map((m) => m.unitId) }, { id, removedAt: now.toISOString(), disabled: true, cancelledRequests: cancelled.count, sessionsRevoked: true });
    // Keep User/Account rows and all historical records so SSO cannot recreate the removed identity.
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
