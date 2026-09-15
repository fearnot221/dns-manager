import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";
import { accountOwnerIdentifier } from "@/lib/auth/owner";

const url = process.env.UNIT_TEST_DATABASE_URL;
it.skipIf(!url)("persists verified Logto names separately from display and historical student IDs", async () => {
  const target = new URL(url!);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/dns_units_test") throw new Error("Use the disposable local test database only");
  const db = new PrismaClient({ datasourceUrl: url });
  const id = crypto.randomUUID();
  try {
    const original = await db.user.create({ data: { id, email: `${id}@test.invalid`, name: "中文姓名", studentId: "115502532", globalRole: "SUPER_ADMIN", accounts: { create: { provider: "logto", providerAccountId: id, type: "oidc" } } }, include: { accounts: true } });
    expect(original.logtoName).toBeNull();
    expect(accountOwnerIdentifier(original.accounts, original.globalRole, original.logtoName)).toBeNull();
    const verified = await db.user.update({ where: { id }, data: { logtoName: "115502532" }, include: { accounts: true } });
    expect(verified.name).toBe("中文姓名");
    expect(accountOwnerIdentifier(verified.accounts, verified.globalRole, verified.logtoName)).toBe("115502532");
    expect(accountOwnerIdentifier(verified.accounts, "USER", verified.logtoName)).toBe("115502532");
  } finally {
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
