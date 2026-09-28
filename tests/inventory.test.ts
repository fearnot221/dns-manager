import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true, localDocument: vi.fn() }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn(), listZones: vi.fn() } }));
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => ({ PDNS_MOCK: "true" }), readConnection: async () => null }));
vi.mock("@/lib/requests/dev-store", () => ({ listDevRequests: () => [] }));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
import { logAuditEvent } from "@/lib/audit/service";
import { localDocument } from "@/lib/db/local-store";
import { powerdns } from "@/lib/powerdns/client";
import { requireActor } from "@/lib/auth/session";
import { captureApprovedRequest, describeRecords, recordId, saveInventory } from "@/lib/inventory/service";
import { PUT, GET } from "@/app/api/inventory/route";
import type { Actor, Zone } from "@/lib/dns/types";
const actor: Actor = { id: "admin-test", email: "admin@example.com", name: "Test Admin", globalRole: "ADMIN", zoneRoles: {} };
const identity = { zoneName: "example.com.", recordName: "test.example.com.", recordType: "A", content: "192.0.2.1" };
const id = recordId("local-mock", identity);
const input = { ...identity, id, expectedUpdatedAt: null, mode: "metadata" as const, applicantName: "Test Applicant", applicantEmail: "applicant@example.com", applicantUnit: "測試單位", applicantExtension: "1234", purpose: "Test only", note: "" };
let document: unknown;
let zone: Zone;
beforeEach(() => {
  vi.clearAllMocks(); document = { records: {} };
  vi.mocked(localDocument).mockImplementation(async (_name, _initial, operation) => operation(document));
  vi.mocked(requireActor).mockResolvedValue(actor);
  zone = { id: identity.zoneName, name: identity.zoneName, kind: "Native", serial: 1, dnssec: false, rrsets: [{ name: identity.recordName, type: "A", ttl: 300, records: [{ content: identity.content, disabled: false }] }] };
  vi.mocked(powerdns.getZone).mockImplementation(async () => zone);
  vi.mocked(powerdns.listZones).mockResolvedValue([zone]);
});
const current = async () => (await describeRecords(actor, identity.zoneName, zone.rrsets))[0].ownership;
describe("DNS ownership and inspection", () => {
  it("includes authorized forward, IPv4 and IPv6 zones in inventory", async () => {
    const names = ["example.com.", "2.0.192.in-addr.arpa.", "8.B.D.0.1.0.0.2.IP6.ARPA."];
    vi.mocked(powerdns.listZones).mockResolvedValue(names.map((name) => ({ ...zone, name })));
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).records.map((record: { zoneName: string }) => record.zoneName)).toEqual(names);
    expect(powerdns.getZone).toHaveBeenCalledTimes(3);
    vi.mocked(powerdns.getZone).mockClear();
    vi.mocked(requireActor).mockResolvedValue({ ...actor, globalRole: "USER", zoneRoles: { [names[1]]: "ADMIN" } });
    expect((await (await GET()).json()).records.map((record: { zoneName: string }) => record.zoneName)).toEqual([names[1]]);
    expect(powerdns.getZone).toHaveBeenCalledExactlyOnceWith(names[1]);
  });
  it.each(["2.0.192.in-addr.arpa.", "8.b.d.0.1.0.0.2.ip6.arpa."])("records reverse inspections without changing DNS: %s", async (zoneName) => {
    const reverse = { ...input, zoneName, recordName: `1.${zoneName}`, recordType: "PTR", content: "host.example.com." };
    reverse.id = recordId("local-mock", reverse);
    zone = { ...zone, name: zoneName, rrsets: [{ name: reverse.recordName, type: "PTR", ttl: 300, records: [{ content: reverse.content, disabled: false }] }] };
    const before = structuredClone(zone);
    for (const mode of ["inspect", "inspect-and-metadata"] as const) {
      const current = (await describeRecords(actor, zoneName, zone.rrsets))[0].ownership;
      await saveInventory(actor, { ...reverse, mode, note: "反解清查", expectedUpdatedAt: current.updatedAt });
    }
    const saved = (await describeRecords(actor, zoneName, zone.rrsets))[0].ownership;
    expect(saved.inspections).toHaveLength(2); expect(saved.applicantName).toBe(input.applicantName);
    expect(saved.inspections[0]).toMatchObject({ note: "反解清查", inspectorId: actor.id });
    await expect(saveInventory({ ...actor, globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } }, { ...reverse, mode: "inspect" })).rejects.toMatchObject({ status: 404 });
    expect(zone).toEqual(before);
  });
  it("stores metadata without changing DNS and keeps blank edits authoritative", async () => {
    await saveInventory(actor, input); const first = await current();
    expect(first.applicantUnit).toBe("測試單位"); expect(first.inspections).toEqual([]);
    await saveInventory(actor, { ...input, applicantUnit: "", expectedUpdatedAt: first.updatedAt });
    expect((await current()).applicantUnit).toBe(""); expect(zone.rrsets[0].records[0].content).toBe(identity.content);
  });
  it("captures approval information without overwriting later manual edits", async () => {
    const application = { ...identity, applicantName: "申請人", applicantUnit: "原單位", purpose: "研究", user: { email: "request@example.com" } };
    await captureApprovedRequest(actor, application); const captured = await current();
    expect(captured.applicantEmail).toBe(application.user.email);
    await saveInventory(actor, { ...input, expectedUpdatedAt: captured.updatedAt });
    await captureApprovedRequest(actor, application); expect((await current()).applicantUnit).toBe(input.applicantUnit);
  });
  it("records server time and authenticated identity, preserving metadata and history", async () => {
    await saveInventory(actor, input); const before = await current(); const start = Date.now();
    await saveInventory(actor, { ...input, mode: "inspect", applicantUnit: "forged", expectedUpdatedAt: before.updatedAt, note: "Verified in test" });
    const after = await current(); expect(after.applicantUnit).toBe(input.applicantUnit);
    expect(after.inspections[0]).toMatchObject({ inspectorId: actor.id, inspectorEmail: actor.email, inspectorName: actor.name, note: "Verified in test" });
    expect(new Date(after.inspections[0].inspectedAt).getTime()).toBeGreaterThanOrEqual(start);
    await saveInventory(actor, { ...input, mode: "inspect", expectedUpdatedAt: after.updatedAt });
    expect((await current()).inspections).toHaveLength(2);
  });
  it("saves ownership and inspection together through the API and audits both", async () => {
    const response = await PUT(new Request("http://localhost/api/inventory", { method: "PUT", headers: { Origin: "http://localhost" }, body: JSON.stringify({ ...input, mode: "inspect-and-metadata", note: "已確認" }) }));
    expect(response.status).toBe(200);
    expect(await current()).toMatchObject({ applicantName: input.applicantName, purpose: input.purpose, inspections: [expect.objectContaining({ note: "已確認", inspectorId: actor.id })] });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "INSPECT_DNS_RECORD", after: expect.objectContaining({ purpose: input.purpose, inspections: expect.any(Array) }) }));
    await expect(saveInventory({ ...actor, globalRole: "USER" }, { ...input, mode: "inspect-and-metadata" })).rejects.toMatchObject({ status: 404 });
  });
  it("rejects stale edits, mismatched connections, deleted records and unauthorized users", async () => {
    await saveInventory(actor, input);
    await expect(saveInventory(actor, input)).rejects.toMatchObject({ status: 409 });
    await expect(saveInventory(actor, { ...input, id: recordId("different-server", identity) })).rejects.toMatchObject({ status: 409 });
    await expect(saveInventory({ ...actor, globalRole: "USER" }, input)).rejects.toMatchObject({ status: 404 });
    zone.rrsets = []; await expect(saveInventory(actor, input)).rejects.toMatchObject({ status: 409 });
  });
  it.each(["inspect", "inspect-and-metadata"] as const)("rejects client-supplied inspector/date in %s mode and blocks ordinary users", async (mode) => {
    const response = await PUT(new Request("http://localhost/api/inventory", { method: "PUT", headers: { Origin: "http://localhost" }, body: JSON.stringify({ ...input, mode, inspectedAt: "2000-01-01T00:00:00.000Z", inspectorEmail: "forged@example.com" }) }));
    expect(response.status).toBe(400); expect((await current()).inspections).toEqual([]);
    vi.mocked(requireActor).mockResolvedValue({ ...actor, globalRole: "USER" }); expect((await GET()).status).toBe(403);
  });
});
