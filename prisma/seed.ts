import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { OWNER_EMAIL } from "../lib/auth/owner";
const db = new PrismaClient();
async function main() {
  const password = process.env.OWNER_INITIAL_PASSWORD;
  if (!password || password.length < 16) throw new Error("OWNER_INITIAL_PASSWORD (at least 16 characters) is required for trusted owner bootstrap.");
  const existing = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) throw new Error("Owner account already exists. Bootstrap will not overwrite or reset it.");
  await db.user.create({ data: { email: OWNER_EMAIL, name: "Fearnot", globalRole: "SUPER_ADMIN", passwordHash: await hashPassword(password), emailVerified: new Date() } });
}
main().finally(() => db.$disconnect()).catch((error) => { console.error(error.message); process.exitCode = 1; });
