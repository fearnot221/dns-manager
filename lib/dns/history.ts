import type { RRSet } from "./types";

export const DNS_HISTORY_ACTIONS = ["SYNC_RECORD", "CREATE_RECORD", "UPDATE_RECORD", "DELETE_RECORD", "APPLY_APPROVED_DNS_RECORD", "APPLY_UNIT_DNS_REQUEST", "DELETE_ZONE"];
export type HistorySource = {
  id: string; createdAt: string | Date; zone: string; recordName?: string | null; recordType?: string | null;
  action: string; success: boolean; oldValue?: unknown; newValue?: unknown; userEmail: string; userName?: string | null;
  dnsScope?: string | null;
};
export type DnsHistoryEvent = {
  id: string; createdAt: string; zone: string; recordName: string; recordType: string;
  operation: "SYNC" | "CREATE" | "UPDATE" | "DELETE"; userEmail: string; userName?: string | null;
  before: RRSet | null; after: RRSet | null; legacyScope: boolean;
};
function snapshot(value: unknown): RRSet | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<RRSet>;
  if (typeof item.name !== "string" || typeof item.type !== "string" || typeof item.ttl !== "number" || !Array.isArray(item.records)) return null;
  // Expose only DNS state, never unrelated audit payloads or request metadata.
  return { name: item.name, type: item.type, ttl: item.ttl, records: item.records.flatMap((record) => typeof record?.content === "string" ? [{ content: record.content, disabled: !!record.disabled }] : []) };
}
export function dnsHistoryEvents(source: HistorySource): DnsHistoryEvent[] {
  if (!source.success || !DNS_HISTORY_ACTIONS.includes(source.action)) return [];
  if (source.action === "DELETE_ZONE") {
    const rrsets = (source.oldValue as { rrsets?: unknown[] } | null)?.rrsets;
    return (Array.isArray(rrsets) ? rrsets : []).flatMap((value) => {
      const before = snapshot(value);
      return before ? [event(source, before, null, `${source.id}:${before.name}:${before.type}`)] : [];
    });
  }
  const before = snapshot(source.oldValue);
  const wrapped = source.action === "APPLY_UNIT_DNS_REQUEST" ? (source.newValue as { rrset?: unknown } | null)?.rrset : source.newValue;
  const after = snapshot(wrapped);
  if (!before && !after) return [];
  return [event(source, before, after, source.id)];
}
function event(source: HistorySource, before: RRSet | null, after: RRSet | null, id: string): DnsHistoryEvent {
  const identity = after ?? before!;
  return { id, createdAt: new Date(source.createdAt).toISOString(), zone: source.zone, recordName: identity.name, recordType: identity.type,
    operation: source.action === "SYNC_RECORD" ? "SYNC" : !before ? "CREATE" : !after ? "DELETE" : "UPDATE", userEmail: source.userEmail, userName: source.userName,
    before, after, legacyScope: !source.dnsScope };
}
