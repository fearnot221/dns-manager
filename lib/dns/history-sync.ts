import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import type { AuditEvent } from "@/lib/audit/service";
import { DNS_HISTORY_ACTIONS, dnsHistoryEvents, type HistorySource } from "./history";
import type { RRSet } from "./types";

/** One durable initial snapshot per connection, zone, name and type. */
export async function syncDnsHistory(zone: string, scope: string, rrsets: RRSet[]) {
  const build = (sources: HistorySource[], baselineScope: string | null, live: RRSet[]) => {
    const states = new Map<string, { rrset: RRSet; createdAt: Date; recovered: boolean }>();
    const synced = new Set<string>();
    const key = (rrset: Pick<RRSet, "name" | "type">) => JSON.stringify([rrset.name, rrset.type]);
    for (const source of [...sources].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))) {
      for (const event of dnsHistoryEvents(source)) {
        const rrset = event.before ?? event.after!;
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
    const sources = await db.auditLog.findMany({ where: { zone, OR: [{ dnsScope: scope }, { dnsScope: null }], success: true, action: { in: DNS_HISTORY_ACTIONS } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const snapshots = [...build(sources.filter((source) => source.dnsScope === scope), scope, rrsets), ...build(sources.filter((source) => !source.dnsScope), null, [])];
    if (snapshots.length) await db.auditLog.createMany({ data: snapshots, skipDuplicates: true });
  } else if (isLocalDemo()) {
    await localDocument<{ events: AuditEvent[] }, void>("audit", async () => ({ events: [] }), (store) => {
      const snapshots = [...build(store.events.filter((event) => event.zone === zone && event.dnsScope === scope), scope, rrsets), ...build(store.events.filter((event) => event.zone === zone && !event.dnsScope), null, [])];
      for (const snapshot of snapshots) if (!store.events.some((event) => event.id === snapshot.id)) store.events.push({ ...snapshot, createdAt: snapshot.createdAt.toISOString(), userId: null, requestId: crypto.randomUUID() });
    }, true);
  }
}
