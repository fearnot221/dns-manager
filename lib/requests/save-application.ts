import "server-only";
import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/dns/types";
import { db } from "@/lib/db/client";
import { ApplicationInputError, requestRecordKey, type PreparedApplication } from "./application";
import { createDevApplication, isDevRequestStore } from "./dev-store";
import { logAuditEvent } from "@/lib/audit/service";
import { redactAudit } from "@/lib/audit/redact";
import { lockUnit, unitAccess } from "@/lib/units/service";
import { connectionScope } from "@/lib/inventory/service";
import { powerdns } from "@/lib/powerdns/client";
import type { RRSet } from "@/lib/dns/types";

export async function saveApplication(actor: Actor, input: PreparedApplication, request: Request) {
  const applicationId = crypto.randomUUID();
  if (isDevRequestStore()) {
    if (input.unitId) throw new ApplicationInputError("單位申請需要資料庫。", 503);
    createDevApplication(actor, input, applicationId);
    await logAuditEvent({ actor, zone: "", action: "REQUEST_DNS_APPLICATION", after: { ...input, applicationId }, success: true, request });
    return { applicationId, count: input.records.length };
  }
  try {
    const scope = input.unitId ? await connectionScope() : undefined;
    const snapshots = new Map<string, RRSet[]>();
    if (input.unitId) {
      for (const zone of new Set(input.records.map((record) => record.zoneName))) snapshots.set(zone, (await powerdns.getZone(zone)).rrsets);
      for (const record of input.records) {
        const current = snapshots.get(record.zoneName)?.find((r) => r.name === record.recordName && r.type === record.recordType);
        if (current?.records.some((r) => r.content === record.content)) throw new ApplicationInputError("解析值已存在，不能透過新增申請取得既有 DNS 的共享權限。", 409);
      }
    }
    await db.$transaction(async (tx) => {
      if (input.unitId) {
        await lockUnit(tx, input.unitId);
        await unitAccess(actor, input.unitId, "edit", tx);
        const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: input.unitId } });
        input = { ...input, applicantUnit: unit.name };
      }
      const userId = actor.id === "dev-admin"
        ? (await tx.user.upsert({ where: { email: actor.email }, update: {}, create: { email: actor.email, name: actor.name, globalRole: "SUPER_ADMIN" } })).id
        : actor.id;
      const { records, ...applicant } = input;
      const existing = await tx.dnsRecordRequest.findMany({
        where: { userId, status: "PENDING", zoneName: { in: [...new Set(records.map((item) => item.zoneName))] } },
        select: { zoneName: true, recordName: true, recordType: true, content: true },
      });
      const pending = new Set(existing.map(requestRecordKey));
      records.forEach((record, index) => {
        const key = requestRecordKey(record);
        if (pending.has(key)) throw new ApplicationInputError(`第 ${index + 1} 筆：已有相同的待審核申請，整份申請尚未送出。`, 409);
        pending.add(key);
      });
      // Chunk SQL statements, not applications; all chunks and audit entries commit together.
      for (let offset = 0; offset < records.length; offset += 250) {
        const chunk = records.slice(offset, offset + 250);
        await tx.dnsRecordRequest.createMany({ data: chunk.map((record) => ({ ...record, ...applicant, applicationId, userId, connectionScope: scope, ...(input.unitId ? { expectedRRSet: (snapshots.get(record.zoneName)?.find((r) => r.name === record.recordName && r.type === record.recordType) as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull } : {}) })) });
        await tx.auditLog.createMany({ data: chunk.map((record) => ({
          userId, userEmail: actor.email, zone: record.zoneName, recordName: record.recordName, recordType: record.recordType,
          action: "REQUEST_DNS_RECORD", success: true, requestId: request.headers.get("x-request-id") || applicationId,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          userAgent: request.headers.get("user-agent")?.slice(0, 500),
          newValue: redactAudit({ ...record, ...applicant, applicationId }) as Prisma.InputJsonValue,
        })) });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return { applicationId, count: input.records.length };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ApplicationInputError("申請資料同時被更新，本次未送出，請重試。", 409);
    }
    throw error;
  }
}
