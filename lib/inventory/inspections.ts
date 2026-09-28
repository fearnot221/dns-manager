import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isOwner } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { lockActiveUser } from "@/lib/units/service";
import { connectionScope, recordId } from "./service";

export async function deleteInspection(actor: Actor, id: string, input: { recordId: string; expectedUpdatedAt: string }) {
  if (!isOwner(actor)) throw new ApiError("無法刪除此清查紀錄。", 403);
  if (!process.env.DATABASE_URL) throw new ApiError("清查紀錄功能需要資料庫。", 503);
  try {
    return await db.$transaction(async (tx) => {
      await lockActiveUser(tx, actor.id);
      await tx.$queryRaw`SELECT "id" FROM "DnsRecordMetadata" WHERE "id" = ${input.recordId} FOR UPDATE`;
      const record = await tx.dnsRecordMetadata.findUnique({ where: { id: input.recordId } });
      const inspection = await tx.dnsInspection.findUnique({ where: { id } });
      if (!record || !inspection || inspection.recordId !== record.id) throw new ApiError("找不到清查紀錄。", 404);
      if (record.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ApiError("清查資料已更新，請重新載入後再試。", 409);
      if (record.id !== recordId(await connectionScope(), record)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
      await tx.dnsInspection.delete({ where: { id } });
      await tx.dnsRecordMetadata.update({ where: { id: record.id }, data: { updatedBy: actor.email, updatedAt: new Date(Math.max(Date.now(), record.updatedAt.getTime() + 1)) } });
      await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: record.zoneName, recordName: record.recordName, recordType: record.recordType, action: "DELETE_DNS_INSPECTION", success: true, oldValue: { ...inspection, inspectedAt: inspection.inspectedAt.toISOString() }, newValue: { deleted: true, inspectionId: id, recordId: record.id } } });
      return { success: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))) throw new ApiError("清查資料同時被更新，請重新載入後再試。", 409);
    throw error;
  }
}
