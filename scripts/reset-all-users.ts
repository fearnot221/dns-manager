import { PrismaClient } from "@prisma/client";
import { newPasscode, passcodeHash } from "../lib/units/passcode";

// Operator-only account reset. Historical DNS requests, messages, inspections and
// audit rows keep their User relation, while every login identity becomes unusable.
// A later Portal login provisions a fresh User from current Logto identities.
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirmAt = args.indexOf("--confirm");
  const confirmed = confirmAt >= 0 && args[confirmAt + 1] === "RESET-ALL-USERS";
  if (apply && !confirmed) throw new Error("Apply requires --confirm RESET-ALL-USERS");
  if (args.some((arg) => !["--apply", "--confirm", "RESET-ALL-USERS"].includes(arg))) {
    throw new Error("Usage: reset-all-users.ts [--apply --confirm RESET-ALL-USERS]");
  }

  const db = new PrismaClient();
  try {
    const [users, accounts, sessions, memberships, permissions, pendingRequests, pendingInspections] = await Promise.all([
      db.user.count(),
      db.account.count(),
      db.session.count(),
      db.unitMember.count(),
      db.zonePermission.count(),
      db.dnsRecordRequest.count({ where: { status: "PENDING" } }),
      db.inspectionTask.count({ where: { status: "PENDING" } }),
    ]);
    const summary = { users, accounts, sessions, memberships, permissions, pendingRequests, pendingInspections };
    console.table(summary);
    if (!apply) {
      console.log("Dry run only. Historical DNS requests, messages, inspections and audit records will be preserved.");
      console.log("Apply with --apply --confirm RESET-ALL-USERS after checking this count and taking a database backup.");
      return;
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
      const targets = await tx.user.findMany({ select: { id: true } });
      const now = new Date();
      await tx.session.deleteMany();
      await tx.account.deleteMany();
      await tx.zonePermission.deleteMany();
      await tx.groupMember.deleteMany();
      await tx.unitMember.deleteMany();
      const cancelledRequests = await tx.dnsRecordRequest.updateMany({ where: { status: "PENDING" }, data: { status: "CANCELLED", reviewNote: "系統管理員已重置所有使用者帳號" } });
      const cancelledInspections = await tx.inspectionTask.updateMany({ where: { status: "PENDING" }, data: { status: "CANCELLED", response: "系統管理員已重置所有使用者帳號", respondedAt: now } });
      const units = await tx.dnsUnit.findMany({ select: { id: true } });
      for (const unit of units) await tx.dnsUnit.update({ where: { id: unit.id }, data: { passcodeHash: passcodeHash(newPasscode()) } });
      for (const user of targets) {
        await tx.user.update({ where: { id: user.id }, data: {
          email: `archived-${user.id}@accounts.invalid`,
          portalEmail: null,
          passwordHash: null,
          studentId: null,
          logtoName: null,
          globalRole: "USER",
          disabled: true,
          removedAt: now,
        } });
      }
      await tx.auditLog.create({ data: {
        userId: null,
        userEmail: "system:vm-cli",
        zone: "",
        action: "RESET_ALL_USERS",
        requestId: crypto.randomUUID(),
        success: true,
        newValue: { archivedUsers: targets.length, cancelledRequests: cancelledRequests.count, cancelledInspections: cancelledInspections.count, rotatedUnitPasscodes: units.length },
      } });
      return { archivedUsers: targets.length, cancelledRequests: cancelledRequests.count, cancelledInspections: cancelledInspections.count, rotatedUnitPasscodes: units.length };
    }, { isolationLevel: "Serializable", timeout: 60_000 });
    console.table(result);
    console.log("All active accounts were reset. Existing sessions and Logto bindings were revoked; fresh Portal logins can provision new users.");
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "User reset failed; check the database and transaction logs.");
  process.exitCode = 1;
});
