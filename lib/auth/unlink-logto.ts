import type { Prisma } from "@prisma/client";

/** Operator-only; caller must run this in a serializable transaction. */
export async function unlinkLogtoAccount(tx: Prisma.TransactionClient, userId: string, subject: string, apply: boolean) {
  const binding = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "logto", providerAccountId: subject } } });
  if (!binding) return { linked: false, applied: false };
  if (binding.userId !== userId) throw new Error("Logto subject belongs to another user; nothing changed");
  if (!apply) return { linked: true, applied: false };
  await tx.account.delete({ where: { id: binding.id } });
  // Invalidate existing JWT-backed idle sessions as well as database sessions.
  await tx.session.deleteMany({ where: { userId } });
  await tx.auditLog.create({ data: { userId, userEmail: "system:vm-cli", zone: "", action: "UNLINK_LOGTO_ACCOUNT", success: true, requestId: crypto.randomUUID(), oldValue: { userId, provider: "logto", subject }, newValue: { sessionsRevoked: true } } });
  return { linked: false, applied: true };
}
