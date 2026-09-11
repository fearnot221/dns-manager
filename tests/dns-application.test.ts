import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareApplication } from "@/lib/requests/application";
import { createDevApplication, listDevRequests } from "@/lib/requests/dev-store";
import type { Actor } from "@/lib/dns/types";

const contact = { applicantName: "王小明", applicantUnit: "電子工程學系", applicantExtension: "01234" };
const record = { zoneName: "example.com", name: "lab", type: "A", content: "192.0.2.10", ttl: 300 };
const zones = ["example.com.", "student.example.com."];
const actor = (): Actor => ({ id: crypto.randomUUID(), email: "user@example.com", globalRole: "USER", zoneRoles: {} });

describe("multi-record DNS applications", () => {
  it("normalizes every record and shares applicant details across different zones", () => {
    const input = prepareApplication({ ...contact, applicantName: " 王小明 ", records: [record, { ...record, zoneName: "student.example.com", type: "CNAME", content: "Target.Example.NET" }] }, zones);
    expect(input.applicantName).toBe("王小明");
    expect(input.applicantExtension).toBe("01234");
    expect(input.records.map((item) => item.recordName)).toEqual(["lab.example.com.", "lab.student.example.com."]);
    expect(input.records[1].content).toBe("target.example.net.");
  });

  it.each(["applicantName", "applicantUnit", "applicantExtension"])("requires %s", (field) => {
    expect(() => prepareApplication({ ...contact, [field]: " ", records: [record] }, zones)).toThrow();
  });
  it("rejects an empty batch and invalid extensions", () => {
    expect(() => prepareApplication({ ...contact, records: [] }, zones)).toThrow();
    expect(() => prepareApplication({ ...contact, applicantExtension: "abc", records: [record] }, zones)).toThrow();
  });
  it("rejects stale or forged zone choices", () => {
    expect(() => prepareApplication({ ...contact, records: [record, { ...record, zoneName: "missing.example" }] }, zones)).toThrow("第 2 筆：此 Zone");
    expect(() => prepareApplication({ ...contact, records: [record] }, [])).toThrow();
  });
  it("identifies the invalid record without accepting a partial batch", () => {
    expect(() => prepareApplication({ ...contact, records: [record, { ...record, content: "not-an-ip" }] }, zones)).toThrow("第 2 筆：Invalid IPv4");
    expect(() => prepareApplication({ ...contact, records: [record, { ...record, type: "SOA" }] }, zones)).toThrow("第 2 筆：紀錄類型");
  });
  it("rejects duplicates after DNS normalization", () => {
    expect(() => prepareApplication({ ...contact, records: [record, { ...record, zoneName: "EXAMPLE.COM.", name: "LAB.EXAMPLE.COM." }] }, zones)).toThrow("第 2 筆：與本次申請");
  });
  it("has no 100 or 500 record-count cap", () => {
    const input = prepareApplication({ ...contact, records: Array.from({ length: 1001 }, (_, i) => ({ ...record, name: `host-${i}` })) }, zones);
    const owner = actor();
    const saved = createDevApplication(owner, input, "large-batch");
    expect(saved).toHaveLength(1001);
    expect(listDevRequests(owner)).toHaveLength(1001);
    expect(saved.every((item) => item.applicantUnit === contact.applicantUnit && item.applicationId === "large-batch")).toBe(true);
  });
  it("does not save any record when a later record is already pending", () => {
    const owner = actor();
    createDevApplication(owner, prepareApplication({ ...contact, records: [record] }, zones), "first");
    const next = prepareApplication({ ...contact, records: [{ ...record, name: "new-record" }, record] }, zones);
    expect(() => createDevApplication(owner, next, "rejected-batch")).toThrow("第 2 筆");
    expect(listDevRequests(owner)).toHaveLength(1);
  });
  it("keeps applicant contact details visible only to the owner and authorized admins", () => {
    const owner = actor();
    const [saved] = createDevApplication(owner, prepareApplication({ ...contact, records: [record] }, zones), "private-batch");
    expect(listDevRequests(actor()).some((item) => item.id === saved.id)).toBe(false);
    expect(listDevRequests({ ...actor(), zoneRoles: { "example.com.": "ADMIN" } }).some((item) => item.id === saved.id)).toBe(true);
    expect(listDevRequests({ ...actor(), zoneRoles: { "student.example.com.": "ADMIN" } }).some((item) => item.id === saved.id)).toBe(false);
  });
});
