import "server-only";
import { db } from "@/lib/db/client";

/** Called only after authentication. Use stored identity, never client-supplied student IDs. */
export async function enrollAllowlistedUser(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { studentId: true, disabled: true, removedAt: true } });
    if (!user?.studentId || user.disabled || user.removedAt) return;
    const matches = await tx.user.count({ where: { studentId: user.studentId, removedAt: null } });
    if (matches !== 1) return; // Ambiguous identity never grants access.
    const entries = await tx.unitAllowlist.findMany({ where: { studentId: user.studentId, userId: null, unit: { status: "APPROVED" } }, orderBy: { unitId: "asc" } });
    for (const entry of entries) {
      await tx.$queryRaw`SELECT "id" FROM "DnsUnit" WHERE "id" = ${entry.unitId} FOR UPDATE`;
      // Revocation and enrollment serialize on the same unit lock.
      const current = await tx.unitAllowlist.findUnique({ where: { unitId_studentId: { unitId: entry.unitId, studentId: user.studentId } }, include: { unit: { select: { status: true } } } });
      if (!current || current.userId || current.unit.status !== "APPROVED") continue;
      await tx.unitMember.upsert({ where: { unitId_userId: { unitId: entry.unitId, userId } }, create: { unitId: entry.unitId, userId, role: "EDITOR" }, update: {} });
      await tx.unitAllowlist.update({ where: { unitId_studentId: { unitId: entry.unitId, studentId: user.studentId } }, data: { userId } });
      await tx.auditLog.create({ data: { userId, userEmail: "", zone: "", action: "ENROLL_UNIT_ALLOWLIST", success: true, newValue: { unitId: entry.unitId, studentId: user.studentId } } });
    }
  });
}
