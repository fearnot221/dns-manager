import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { zoneCategory } from "@/lib/dns/zone-category";
import { lockActiveUser, lockUnit, requireActiveUnit, requireUnitDatabase } from "@/lib/units/service";
import { connectionScope, recordId } from "./service";

export type UnitAssignment = { id: string; zoneName: string; recordName: string; recordType: string; content: string; expectedUpdatedAt: string | null; unitId: string };

/** Assign one live DNS value, without changing DNS or creating an inspection notification. */
export async function assignRecordUnit(actor: Actor, input: UnitAssignment) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以指派 DNS 所屬單位。", 403);
  requireUnitDatabase();
  if (zoneCategory(input.zoneName) !== "forward") throw new ApiError("清查指派僅適用於一般網域。", 400);
  try {
    return await db.$transaction(async (tx) => {
      await lockActiveUser(tx, actor.id);
      const initial = await tx.dnsRecordMetadata.findUnique({ where: { id: input.id } });
      // Share the unit locks used by request submission/review and serialize transfers.
      for (const id of [...new Set([input.unitId, ...(initial?.unitId ? [initial.unitId] : [])])].sort()) await lockUnit(tx, id);
      await requireActiveUnit(tx, input.unitId);
      await tx.$queryRaw`SELECT "id" FROM "DnsRecordMetadata" WHERE "id" = ${input.id} FOR UPDATE`;
      const current = await tx.dnsRecordMetadata.findUnique({ where: { id: input.id } });
      if ((current?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt || current?.unitId !== initial?.unitId) throw new ApiError("歸屬資料已更新，請重新載入後再指派。", 409);
      if (input.id !== recordId(await connectionScope(), input)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
      const zone = await powerdns.getZone(input.zoneName);
      if (!zone.rrsets.some((rrset) => rrset.name === input.recordName && rrset.type === input.recordType && rrset.records.some((record) => record.content === input.content))) throw new ApiError("此解析值已不存在，請重新載入。", 409);
      const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: input.unitId }, select: { name: true } });
      const { id, zoneName, recordName, recordType, content } = input;
      const assignment = { unitId: input.unitId, applicantUnit: unit.name, updatedBy: actor.email };
      const saved = await tx.dnsRecordMetadata.upsert({ where: { id }, create: { id, zoneName, recordName, recordType, content, ...assignment }, update: { ...assignment, updatedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: zoneName, recordName, recordType, action: "ASSIGN_DNS_UNIT", success: true, oldValue: { recordId: id, unitId: current?.unitId ?? null, applicantUnit: current?.applicantUnit ?? "" }, newValue: { recordId: id, unitId: saved.unitId, applicantUnit: saved.applicantUnit } } });
      return { success: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (["P2034", "P2002"].includes(error.code) || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))) throw new ApiError("歸屬資料同時被更新，請重新載入後再指派。", 409);
    throw error;
  }
}
