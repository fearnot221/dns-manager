import { describe, expect, it } from "vitest";
import { auditChanges } from "@/components/admin/audit-workbench";

describe("audit change comparison", () => {
  it("marks only the fields that differ between object snapshots", () => {
    const changes = auditChanges({ name: "www.example.com.", ttl: 300, records: [{ content: "1.1.1.1" }] }, { name: "www.example.com.", ttl: 600, records: [{ content: "1.1.1.1" }] });
    expect(changes?.filter((change) => change.changed).map((change) => change.key)).toEqual(["ttl"]);
    expect(changes).toHaveLength(3);
  });
  it("lists every field once when a record is created or removed", () => {
    expect(auditChanges(null, { ttl: 60 })).toEqual([{ key: "ttl", before: undefined, after: 60, changed: true }]);
    expect(auditChanges({ ttl: 60 }, undefined)?.map((change) => change.key)).toEqual(["ttl"]);
  });
  it("reports no changes when nothing was recorded and falls back for non-object payloads", () => {
    expect(auditChanges(null, undefined)).toEqual([]);
    expect(auditChanges(["a"], ["b"])).toBeNull();
    expect(auditChanges("before", { ttl: 60 })).toBeNull();
  });
});
