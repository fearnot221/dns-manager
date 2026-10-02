import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { canManageRecord, canManageZone } from "@/lib/auth/permissions";
import { apiError, notFoundUnless } from "@/lib/api/respond";
import { db } from "@/lib/db/client";
import { localAuditEvents } from "@/lib/audit/service";
import { connectionScope } from "@/lib/inventory/service";
import { normalizeDnsName, normalizeZoneName } from "@/lib/dns/names";
import { DNS_HISTORY_ACTIONS, dnsHistoryEvents, type HistorySource } from "@/lib/dns/history";

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
    // Legacy snapshots lack a connection scope. Preserve them with an explicit label.
    // Zone deletion snapshots contain multiple identities: expand before filtering and paging.
    const sources: HistorySource[] = process.env.DATABASE_URL ? await db.auditLog.findMany({
      where: { zone, success: true, action: { in: DNS_HISTORY_ACTIONS }, OR: [{ dnsScope: scope }, { dnsScope: null }] },
      select: { id: true, createdAt: true, zone: true, action: true, success: true, recordName: true, recordType: true, oldValue: true, newValue: true, userEmail: true, dnsScope: true, user: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }).then((rows) => rows.map(({ user, ...row }) => ({ ...row, userName: user?.name }))) : await localAuditEvents();
    const q = query.q.toLowerCase();
    const events = sources.filter((source) => source.zone === zone && (!source.dnsScope || source.dnsScope === scope)).flatMap(dnsHistoryEvents)
      .filter((event) => canManageRecord(actor, zone, event.recordName, event.recordType) && (!name || event.recordName === name) && (!type || event.recordType === type)
        && (!q || [event.recordName, event.recordType, ...[event.before, event.after].flatMap((rrset) => rrset?.records.map((r) => r.content) ?? [])].some((value) => value.toLowerCase().includes(q))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return Response.json({ events: events.slice((query.page - 1) * 50, query.page * 50), total: events.length, page: query.page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
