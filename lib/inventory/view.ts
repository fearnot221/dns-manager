import type { InventoryRecord } from "./types";

export type InventoryGroup = "applicantName" | "applicantUnit" | "purpose" | "zoneName";
export type InventoryFilter = "all" | "unreviewed" | "reviewed" | "missing";

/** View-only filtering; callers supply records already authorized by the server. */
export function groupInventory(records: InventoryRecord[], group: InventoryGroup, status: InventoryFilter, query: string) {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, InventoryRecord[]>();
  for (const record of records) {
    const owner = record.ownership;
    if (status === "unreviewed" && owner.inspections.length) continue;
    if (status === "reviewed" && !owner.inspections.length) continue;
    if (status === "missing" && [owner.applicantName, owner.applicantUnit, owner.purpose].every((value) => value.trim())) continue;
    if (![record.zoneName, record.recordName, record.recordType, record.content, owner.applicantName, owner.applicantEmail, owner.applicantUnit, owner.applicantExtension, owner.purpose].join(" ").toLowerCase().includes(needle)) continue;
    const key = (group === "zoneName" ? record.zoneName : owner[group]).trim() || "尚未填寫";
    const bucket = groups.get(key);
    if (bucket) bucket.push(record); else groups.set(key, [record]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-TW", { numeric: true }));
}

/** Keep the primary departments first; other domain tabs retain alphabetical order. */
export function compareInventoryDomains(a: string, b: string) {
  const priority = (name: string) => {
    const domain = name.toLowerCase().replace(/\.$/, "");
    if (domain === "ee.ncu.edu.tw") return 0;
    if (domain === "ce.ncu.edu.tw") return 1;
    return 2;
  };
  return priority(a) - priority(b) || a.localeCompare(b);
}
