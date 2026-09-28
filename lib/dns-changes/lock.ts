import "server-only";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { connectionScope } from "@/lib/inventory/service";

/** Serialize this application's writes; PowerDNS has no compare-and-swap API. */
export async function lockDnsZone(tx: Prisma.TransactionClient, zone: string, scope: string) {
  const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${scope + "|" + zone.toLowerCase()}, 0)) AS locked`;
  if (!rows[0]?.locked) throw new ApiError("此網域正在更新，請稍後重試。", 409);
}
export async function withDnsZoneLock<T>(zone: string, action: () => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) return action();
  const scope = await connectionScope();
  return db.$transaction(async (tx) => { await lockDnsZone(tx, zone, scope); return action(); }, { timeout: 60000 });
}
