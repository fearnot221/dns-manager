import "server-only";
import { Prisma, type DnsRequestPublication } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import type { RRSet } from "@/lib/dns/types";
import { unitChangeState } from "@/lib/units/change";

export const publicationPendingMessage = "此申請已有 DNS 發布紀錄，結果尚待核對，不能退回或取消。請重新核准以核對並完成同步；若 DNS 已有其他變更，請由維運核對發布紀錄。";

/** Call under the review/zone locks, BEFORE contacting PowerDNS.
 * This uses the root client deliberately: rolling back the review must not erase
 * evidence of an external write whose response or subsequent DB commit failed.
 */
export async function beginPublication(requestId: string, connectionScope: string, actorId: string, before: RRSet | undefined, after: RRSet | undefined) {
  return db.dnsRequestPublication.create({ data: {
    requestId, connectionScope, actorId,
    beforeRRSet: before ? before as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
    afterRRSet: after ? after as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
  } });
}

export function publicationState(publication: DnsRequestPublication, scope: string, current: RRSet | undefined) {
  if (publication.connectionScope !== scope) throw new ApiError("發布時的 PowerDNS 連線與目前不同，請由維運核對發布紀錄。", 409);
  const state = unitChangeState(current, publication.beforeRRSet as unknown as RRSet, publication.afterRRSet as unknown as RRSet);
  if (state === "CONFLICT") throw new ApiError("DNS 與發布前後快照皆不同，未重複寫入；請由維運核對發布紀錄。", 409);
  return state;
}

export async function assertNoUnresolvedPublications(tx: Pick<Prisma.TransactionClient, "$queryRaw">, userId?: string) {
  const rows = await tx.$queryRaw<{ requestId: string }[]>`
    SELECT p."requestId" FROM "DnsRequestPublication" p
    JOIN "DnsRecordRequest" r ON r."id" = p."requestId"
    WHERE p."completedAt" IS NULL AND r."status" = 'PENDING'
      AND (${userId ?? null}::text IS NULL OR r."userId" = ${userId ?? null}) LIMIT 1`;
  if (rows.length) throw new ApiError(publicationPendingMessage, 409);
}
