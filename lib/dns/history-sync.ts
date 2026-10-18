import "server-only";
import { Prisma } from "@prisma/client";
import { historySourcesSql } from "./history-query";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import type { AuditEvent } from "@/lib/audit/service";
import { dnsHistoryEvents, type HistorySource } from "./history";
import type { RRSet } from "./types";

/** One durable initial snapshot per connection, zone, name and type. */
export async function syncDnsHistory(zone: string, scope: string, rrsets: RRSet[]) {
  const build = (sources: HistorySource[], baselineScope: string | null, live: RRSet[]) => {
    const states = new Map<string, { rrset: RRSet; createdAt: Date; recovered: boolean }>();
    const synced = new Set<string>();
    const key = (rrset: Pick<RRSet, "name" | "type">) => JSON.stringify([rrset.name, rrset.type]);
    for (const source of [...sources].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))) {
      for (const event of dnsHistoryEvents(source)) {
        const rrset = event.before ?? event.after;
        if (!rrset) continue;
        if (event.operation === "SYNC") synced.add(key(rrset));
        if (!states.has(key(rrset))) states.set(key(rrset), { rrset, createdAt: new Date(source.createdAt), recovered: true });
      }
    }
    for (const rrset of live) if (!states.has(key(rrset))) states.set(key(rrset), { rrset, createdAt: new Date(), recovered: false });
    return [...states].filter(([identity]) => !synced.has(identity)).map(([identity, state]) => ({
      id: "dns-sync-" + createHash("sha256").update(JSON.stringify([baselineScope, zone, identity])).digest("hex"),
      createdAt: state.createdAt, dnsScope: baselineScope, zone, recordName: state.rrset.name, recordType: state.rrset.type,
      action: "SYNC_RECORD", success: true, userEmail: state.recovered ? "PowerDNS（歷史快照補登）" : "PowerDNS", newValue: { name: state.rrset.name, type: state.rrset.type, ttl: state.rrset.ttl, records: state.rrset.records.map((record) => ({ content: record.content, disabled: !!record.disabled })) },
    }));
  };
  if (process.env.DATABASE_URL) {
    const lock = "dns-history-baseline:" + JSON.stringify([scope, zone]);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      // Read payloads only for identities without a baseline, including values already deleted.
      const sources = await tx.$queryRaw<HistorySource[]>(Prisma.sql`${historySourcesSql(zone, scope, true)}
        SELECT DISTINCT ON ("dnsScope", name, type) * FROM events e WHERE NOT ownership AND NOT EXISTS (
          SELECT 1 FROM "AuditLog" b WHERE b."zone" = ${zone} AND b."action" = 'SYNC_RECORD' AND b."success"
            AND b."dnsScope" IS NOT DISTINCT FROM e."dnsScope" AND b."recordName" = e.name AND b."recordType" = e.type
        ) ORDER BY "dnsScope", name, type, "createdAt", "id"`);
      const candidates = build([], scope, rrsets);
      const saved = candidates.length ? new Set((await tx.auditLog.findMany({ where: { id: { in: candidates.map(row => row.id) } }, select: { id: true } })).map(row => row.id)) : new Set<string>();
      const live = rrsets.filter((_, index) => !saved.has(candidates[index].id));
      const snapshots = [...build(sources.filter(source => source.dnsScope === scope), scope, live), ...build(sources.filter(source => !source.dnsScope), null, [])];
      if (snapshots.length) await tx.auditLog.createMany({ data: snapshots, skipDuplicates: true });
    }, { timeout: 30000 });
  } else if (isLocalDemo()) {
    await localDocument<{ events: AuditEvent[] }, void>("audit", async () => ({ events: [] }), (store) => {
      const snapshots = [...build(store.events.filter((event) => event.zone === zone && event.dnsScope === scope), scope, rrsets), ...build(store.events.filter((event) => event.zone === zone && !event.dnsScope), null, [])];
      for (const snapshot of snapshots) if (!store.events.some((event) => event.id === snapshot.id)) store.events.push({ ...snapshot, createdAt: snapshot.createdAt.toISOString(), userId: null, requestId: crypto.randomUUID() });
    }, true);
  }
}
