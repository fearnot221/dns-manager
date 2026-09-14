import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
const db = new PrismaClient();
async function main() {
  const password = process.env.OWNER_INITIAL_PASSWORD;
  if (!password || password.length < 16) throw new Error("OWNER_INITIAL_PASSWORD (at least 16 characters) is required for trusted owner bootstrap.");
  const email = "owner-bootstrap@accounts.invalid";
  const existing = await db.user.findFirst({ where: { OR: [{ globalRole: "SUPER_ADMIN" }, { email }] } });
  if (existing) throw new Error("Owner account already exists. Bootstrap will not overwrite or reset it.");
  await db.user.create({ data: { email, name: "初始管理帳號", globalRole: "SUPER_ADMIN", passwordHash: await hashPassword(password) } });
}
main().finally(() => db.$disconnect()).catch((error) => { console.error(error.message); process.exitCode = 1; });
