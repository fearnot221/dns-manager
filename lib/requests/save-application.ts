import "server-only";
import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/dns/types";
import { db } from "@/lib/db/client";
import { ApplicationInputError, requestRecordKey, type PreparedApplication } from "./application";
import { createDevApplication, isDevRequestStore } from "./dev-store";

export async function saveApplication(actor: Actor, input: PreparedApplication, request: Request) {
  const applicationId = crypto.randomUUID();
  if (isDevRequestStore()) {
    createDevApplication(actor, input, applicationId);
    return { applicationId, count: input.records.length };
  }
  try {
    await db.$transaction(async (tx) => {
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
        await tx.dnsRecordRequest.createMany({ data: chunk.map((record) => ({ ...record, ...applicant, applicationId, userId })) });
        await tx.auditLog.createMany({ data: chunk.map((record) => ({
          userId, userEmail: actor.email, zone: record.zoneName, recordName: record.recordName, recordType: record.recordType,
          action: "REQUEST_DNS_RECORD", success: true, requestId: applicationId,
          userAgent: request.headers.get("user-agent")?.slice(0, 500),
          newValue: { ...record, ...applicant, applicationId },
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
