import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { auditMutation } from "@/lib/audit/mutation";
import { logAuditEvent } from "@/lib/audit/service";
import { powerdns } from "@/lib/powerdns/client";
import { describeRecords } from "@/lib/inventory/service";
import { csvRow, dnsCsvHeaders } from "@/lib/dns/csv";

export const POST = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅系統管理員可匯出全部 DNS 資料。", 403);
    const zones = (await powerdns.listZones()).sort((a, b) => a.name.localeCompare(b.name));
    const chunks = ["\uFEFF" + csvRow(dnsCsvHeaders)];
    let recordCount = 0;
    // All categories, not the forward-only inventory view. Never emit a partial success file.
    for (let offset = 0; offset < zones.length; offset += 4) {
      if (request.signal.aborted) throw new ApiError("匯出已取消。", 499);
      const batch = await Promise.all(zones.slice(offset, offset + 4).map(async ({ name }) => {
        const zone = await powerdns.getZone(name);
        const records = await describeRecords(actor, zone.name, zone.rrsets);
        const comments = new Map(zone.rrsets.map((r) => [JSON.stringify([r.name, r.type]), r.comments ?? []]));
        return records.map((record) => {
          const owner = record.ownership;
          return csvRow([zone.name, zone.kind, zone.serial, zone.dnssec, record.recordName, record.recordType, record.content, record.ttl, record.disabled, owner.applicantName, owner.applicantEmail, owner.applicantUnit, owner.applicantExtension, owner.purpose, owner.updatedAt, JSON.stringify(owner.inspections), JSON.stringify(comments.get(JSON.stringify([record.recordName, record.recordType])) ?? [])]);
        });
      }));
      for (const rows of batch) { recordCount += rows.length; chunks.push(rows.join("")); }
    }
    // Audit metadata only; do not duplicate the DNS dataset or contact information in the log.
    await logAuditEvent({ actor, zone: "", action: "EXPORT_ALL_DNS_CSV", after: { zoneCount: zones.length, recordCount, format: "csv" }, success: true, request });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(chunks.join(""), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dns-records-${timestamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return apiError(error); }
});
