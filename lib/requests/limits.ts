import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/respond";
import { applicationLimits } from "./limit-policy";
/** Caller holds the unit row lock. No historical data is deleted to enforce budgets. */
export async function assertUnitRequestBudget(tx:Prisma.TransactionClient,unitId:string,count:number,bytes=count*1024) {
  const limits=applicationLimits();
  if(count>limits.batch)throw new ApiError(`每份申請最多 ${limits.batch} 筆，請分批送出。`,400);
  const pending=await tx.dnsRecordRequest.count({where:{unitId,status:"PENDING"}});
  if (pending+count>limits.pending) throw new ApiError("單位待審核申請已達上限，請等待審核後再送出。",429);
  const recent=await tx.dnsRecordRequest.count({where:{unitId,createdAt:{gte:new Date(Date.now()-86400_000)}}});
  if (recent+count>limits.daily) throw new ApiError("單位最近 24 小時申請已達上限，請稍後再試。",429);
  const sizes=await tx.$queryRaw<{pending:bigint;daily:bigint}[]>`
    SELECT COALESCE(SUM(octet_length(row_to_json(r)::text)) FILTER (WHERE "status"='PENDING'),0)::bigint AS pending,
           COALESCE(SUM(octet_length(row_to_json(r)::text)) FILTER (WHERE "createdAt">=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '24 hours'),0)::bigint AS daily
    FROM "DnsRecordRequest" r WHERE "unitId"=${unitId}
      AND ("status"='PENDING' OR "createdAt">=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '24 hours')`;
  if (sizes[0].pending+BigInt(bytes)>BigInt(limits.pendingBytes)) throw new ApiError("單位待審核資料量已達上限，請等待審核後再送出。",429);
  if (sizes[0].daily+BigInt(bytes)>BigInt(limits.dailyBytes)) throw new ApiError("單位最近 24 小時申請資料量已達上限，請稍後再試。",429);
}
