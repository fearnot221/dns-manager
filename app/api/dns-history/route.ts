import { syncDnsHistory } from "@/lib/dns/history-sync";
import { powerdns } from "@/lib/powerdns/client";
import { PowerDNSError } from "@/lib/powerdns/errors";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { canManageRecord, canManageZone } from "@/lib/auth/permissions";
import { apiError, notFoundUnless } from "@/lib/api/respond";
import { queryDnsHistory } from "@/lib/dns/history-query";
import { localAuditEvents } from "@/lib/audit/service";
import { connectionScope } from "@/lib/inventory/service";
import { normalizeDnsName, normalizeZoneName } from "@/lib/dns/names";
import { dnsHistoryEvents } from "@/lib/dns/history";

const querySchema = z.object({ zone: z.string().min(1).max(255), name: z.string().max(255).default(""), type: z.string().max(30).default(""), q: z.string().max(200).default(""), page: z.coerce.number().int().min(1).max(10000).default(1) });
export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const zone = normalizeZoneName(query.zone);
    notFoundUnless(canManageZone(actor, zone));
    const name = query.name ? normalizeDnsName(query.name, zone) : "";
    const type = query.type.toUpperCase();
    if (name && type) notFoundUnless(canManageRecord(actor, zone, name, type));
    const scope = await connectionScope();
    let syncError = "";
    let rrsets: Awaited<ReturnType<typeof powerdns.getZone>>["rrsets"] = [];
    try { rrsets = (await powerdns.getZone(zone)).rrsets.filter((rrset) => canManageRecord(actor, zone, rrset.name, rrset.type)); }
    catch (error) { if (!(error instanceof PowerDNSError && error.status === 404)) syncError = "PowerDNS 暫時無法讀取；顯示已保存的歷程，尚未同步的紀錄請稍後重試。"; }
    await syncDnsHistory(zone, scope, rrsets);
    if (process.env.DATABASE_URL) {
      const result = await queryDnsHistory(actor, zone, scope, { ...query, name, type });
      return Response.json({ ...result, page: query.page, syncError }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const sources = await localAuditEvents();
    const q = query.q.toLowerCase();
    const events = sources.filter((source) => source.zone === zone && (!source.dnsScope || source.dnsScope === scope)).flatMap(dnsHistoryEvents)
      .filter((event) => canManageRecord(actor, zone, event.recordName, event.recordType) && (!name || event.recordName === name) && (!type || event.recordType === type)
        && (!q || [event.recordName, event.recordType, ...[event.ownership?.before, event.ownership?.after].flatMap((value) => value ? Object.values(value).filter((field): field is string => typeof field === "string") : []), ...[event.before, event.after].flatMap((rrset) => rrset?.records.map((r) => r.content) ?? [])].some((value) => value.toLowerCase().includes(q))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(a.operation === "SYNC") - Number(b.operation === "SYNC") || b.id.localeCompare(a.id));
    return Response.json({ events: events.slice((query.page - 1) * 50, query.page * 50), total: events.length, page: query.page, syncError }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
