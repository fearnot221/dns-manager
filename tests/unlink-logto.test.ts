import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { unlinkLogtoAccount } from "@/lib/auth/unlink-logto";

function fixture(userId: string | null = "owner") {
  const tx = { account: { findUnique: vi.fn().mockResolvedValue(userId ? { id: "binding", userId } : null), delete: vi.fn() }, session: { deleteMany: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}
it("only removes the exact binding and revokes target sessions, without changing user data", async () => {
  const { tx, client } = fixture();
  expect(await unlinkLogtoAccount(client, "owner", "verified-sub", true)).toEqual({ linked: false, applied: true });
  expect(tx.account.findUnique).toHaveBeenCalledWith({ where: { provider_providerAccountId: { provider: "logto", providerAccountId: "verified-sub" } } });
  expect(tx.account.delete).toHaveBeenCalledWith({ where: { id: "binding" } });
  expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner" } });
  expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "UNLINK_LOGTO_ACCOUNT", userId: "owner" }) });
});
it("dry runs and already-unlinked identities perform no writes", async () => {
  for (const userId of ["owner", null]) {
    const { tx, client } = fixture(userId);
    await unlinkLogtoAccount(client, "owner", "verified-sub", false);
    if (!userId) await unlinkLogtoAccount(client, "owner", "verified-sub", true);
    expect(tx.account.delete).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  }
});
it("refuses to unlink a subject from any other account", async () => {
  const { tx, client } = fixture("someone-else");
  await expect(unlinkLogtoAccount(client, "owner", "verified-sub", true)).rejects.toThrow("belongs to another user");
  expect(tx.account.delete).not.toHaveBeenCalled();
  expect(tx.session.deleteMany).not.toHaveBeenCalled();
});
