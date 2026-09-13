import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/auth/password";

// Run explicitly on the VM using the tools image. Never part of automatic deployment.
const db = new PrismaClient();
try {
  const email = "dns-test@example.invalid";
  if (await db.user.findUnique({ where: { email } })) throw new Error("Test account already exists; no password or roles were changed.");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name: "DNS 測試使用者", globalRole: "USER", passwordHash } });
    await tx.auditLog.create({ data: { userEmail: "system:vm-cli", zone: "", action: "CREATE_TEST_USER", success: true, newValue: { id: user.id, email, name: user.name, globalRole: user.globalRole }, requestId: crypto.randomUUID() } });
  });
  console.log(`Account: ${email}\nPassword: ${password}\nRole: USER\nSave this password securely. Disable the account after testing.`);
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("Test account") ? error.message : "Unable to create test account. Check database connectivity and permissions.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
