import { expect, it } from "vitest";
import { groupInventory } from "@/lib/inventory/view";
import type { InventoryRecord } from "@/lib/inventory/types";
const record: InventoryRecord = { zoneName: "example.com.", recordName: "lab.example.com.", recordType: "AAAA", content: "2001:db8::1", ttl: 300, disabled: false, ownership: { id: "one", applicantName: "申請人", applicantEmail: "", applicantUnit: "Lab 10", applicantExtension: "1234", purpose: "研究", updatedAt: null, updatedBy: "", inspections: [] } };
it("supports type and extension searches with trimmed case-insensitive input", () => {
  expect(groupInventory([record], "applicantUnit", "all", " aaaa ")[0][1]).toEqual([record]);
  expect(groupInventory([record], "applicantUnit", "all", "1234")).toHaveLength(1);
  expect(groupInventory([record], "applicantUnit", "all", "missing")).toEqual([]);
});
it("distinguishes unreviewed, reviewed and whitespace-only missing metadata", () => {
  expect(groupInventory([record], "zoneName", "reviewed", "")).toEqual([]);
  expect(groupInventory([record], "zoneName", "unreviewed", "")).toHaveLength(1);
  expect(groupInventory([record], "zoneName", "missing", "")).toEqual([]);
  const missing = { ...record, ownership: { ...record.ownership, applicantUnit: "  " } };
  expect(groupInventory([missing], "applicantUnit", "missing", "")[0][0]).toBe("尚未填寫");
});
it("sorts group labels naturally without mutating input records", () => {
  const other = { ...record, ownership: { ...record.ownership, applicantUnit: "Lab 2" } };
  const input = [record, other];
  expect(groupInventory(input, "applicantUnit", "all", "").map(([label]) => label)).toEqual(["Lab 2", "Lab 10"]);
  expect(input).toEqual([record, other]);
});
