import { z } from "zod";
import { RECORD_TYPES, type RRSet } from "@/lib/dns/types";

export const dnsChangeActions = ["CREATE_RECORD", "UPDATE_RECORD", "DELETE_RECORD", "APPLY_APPROVED_DNS_RECORD", "APPLY_UNIT_DNS_REQUEST"];
const snapshotSchema = z.object({
  name: z.string().min(1), type: z.enum(RECORD_TYPES), ttl: z.number().int().min(0),
  records: z.array(z.object({ content: z.string(), disabled: z.boolean() }).strict()).min(1),
  comments: z.array(z.object({ content: z.string(), account: z.string().optional(), modified_at: z.number().optional() }).strict()).optional(),
}).strict();
export function snapshotKey(value: RRSet | null) {
  if (!value) return "null";
  return JSON.stringify({ name: value.name, type: value.type, ttl: value.ttl, records: [...value.records].sort((a, b) => a.content.localeCompare(b.content)).map((r) => ({ content: r.content, disabled: r.disabled })), comments: [...(value.comments ?? [])].map((c) => ({ content: c.content, account: c.account ?? "", modified_at: c.modified_at ?? 0 })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
}
export function changeSnapshot(event: { action: string; oldValue: unknown; newValue: unknown; zone: string; recordName?: string | null; recordType?: string | null }) {
  const wrapped = event.newValue && typeof event.newValue === "object" && !Array.isArray(event.newValue) ? event.newValue as Record<string, unknown> : {};
  const beforeResult = snapshotSchema.nullable().safeParse(event.oldValue ?? null);
  const afterResult = snapshotSchema.nullable().safeParse(event.action === "APPLY_UNIT_DNS_REQUEST" ? wrapped.rrset : event.newValue ?? null);
  if (!beforeResult.success || !afterResult.success || JSON.stringify([event.oldValue, event.newValue]).includes("[REDACTED]")) return null;
  const before = beforeResult.data, after = afterResult.data;
  const identity = after ?? before;
  if (!identity || !dnsChangeActions.includes(event.action)) return null;
  if (before && after && (before.name !== after.name || before.type !== after.type)) return null;
  if (event.recordName && event.recordName !== identity.name || event.recordType && event.recordType !== identity.type) return null;
  if (event.zone && identity.name !== event.zone && !identity.name.endsWith(`.${event.zone}`)) return null;
  if (snapshotKey(before) === snapshotKey(after)) return null;
  const operation = event.action === "DELETE_RECORD" || wrapped.operation === "DELETE" ? "DELETE" : event.action === "UPDATE_RECORD" || wrapped.operation === "UPDATE" ? "UPDATE" : event.action === "CREATE_RECORD" || event.action === "APPLY_APPROVED_DNS_RECORD" || wrapped.operation === "CREATE" ? "CREATE" : !before ? "CREATE" : !after ? "DELETE" : "UPDATE";
  return { before, after, name: identity.name, type: identity.type, operation };
}
