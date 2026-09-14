import { PrismaClient } from "@prisma/client";
import { unlinkLogtoAccount } from "../lib/auth/unlink-logto";

// Operator-only migration; never run automatically on deployment.
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") {
    const db = new PrismaClient();
    try { console.table(await db.user.findMany({ where: { removedAt: null }, select: { id: true, name: true, portalEmail: true, globalRole: true, disabled: true }, orderBy: { createdAt: "asc" } })); }
    finally { await db.$disconnect(); }
    return;
  }
  const value = (key: string) => args[args.indexOf(key) + 1];
  if (!args.includes("--user-id") || !args.includes("--subject")) throw new Error("Usage: --user-id EXISTING_DATABASE_USER_ID --subject VERIFIED_LOGTO_USER_ID [--unlink] [--apply --confirm-subject VERIFIED_LOGTO_USER_ID]");
  const userId = value("--user-id"), subject = value("--subject");
  if (!userId || !subject || userId.startsWith("--") || subject.startsWith("--") || subject.length > 200) throw new Error("Invalid account identifiers");
  if (args.includes("--apply") && (!args.includes("--confirm-subject") || value("--confirm-subject") !== subject)) throw new Error("Confirm the exact Logto User ID before applying");
  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { accounts: true } });
      if (!user || user.disabled || user.removedAt) throw new Error("Target must be an existing active account");
      const owner = user.globalRole === "SUPER_ADMIN";
      if (owner !== (!!process.env.LOGTO_OWNER_SUB && subject === process.env.LOGTO_OWNER_SUB)) throw new Error("Owner binding does not match verified LOGTO_OWNER_SUB");
      if (args.includes("--unlink")) {
        const result = await unlinkLogtoAccount(tx, userId, subject, args.includes("--apply"));
        console.log(result.applied ? "Logto unlinked and all target sessions revoked. User, roles, DNS and unit data preserved." : result.linked ? "Dry run passed. Exact binding found; no changes made." : "No matching Logto binding exists; no changes made.");
        return;
      }
      if (user.accounts.some((a) => a.provider === "logto")) throw new Error("Target already has a Logto binding; nothing overwritten");
      if (await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "logto", providerAccountId: subject } } })) throw new Error("Logto subject already belongs to an account; nothing overwritten");
      console.log(`Target: ${user.name || "No name"} (${user.id}); current role: ${user.globalRole}`);
      if (!args.includes("--apply")) { console.log("Dry run passed. No changes made. Verify both identities before using --apply --confirm-subject."); return; }
      await tx.account.create({ data: { userId, provider: "logto", providerAccountId: subject, type: "oidc" } });
      await tx.auditLog.create({ data: { userId, userEmail: "system:vm-cli", zone: "", action: "LINK_LOGTO_ACCOUNT", success: true, requestId: crypto.randomUUID(), newValue: { userId, provider: "logto", subject } } });
      console.log("Logto linked. Existing roles, DNS records, units and audit history preserved.");
    }, { isolationLevel: "Serializable" });
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Link failed; check database availability and account conflicts."); process.exitCode = 1; });
