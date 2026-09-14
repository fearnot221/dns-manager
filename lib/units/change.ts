import type { RRSet } from "@/lib/dns/types";
import { rrsetHash } from "@/lib/dns/rrset";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}
// PostgreSQL JSONB reorders object keys; compare values, not serialization order.
export function unitRRSetHash(value: RRSet | undefined) { return rrsetHash(ordered(value) as RRSet | undefined); }

export function replaceUnitValue(before: RRSet, oldContent: string, content: string): RRSet {
  if (!before.records.some((record) => record.content === oldContent)) throw new Error("原始解析值已不存在。");
  if (oldContent === content) throw new Error("新舊解析內容相同，無需申請。");
  if (before.records.some((record) => record.content === content)) throw new Error("新解析值已存在，不能覆蓋其他紀錄。");
  return { ...before, records: before.records.map((record) => record.content === oldContent ? { ...record, content } : record) };
}
export function unitChangeState(current: RRSet | undefined, before: RRSet, after: RRSet) {
  if (unitRRSetHash(current) === unitRRSetHash(before)) return "READY";
  if (unitRRSetHash(current) === unitRRSetHash(after)) return "APPLIED";
  return "CONFLICT";
}
