import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/dns/history-sync", () => ({ syncDnsHistory: vi.fn() }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn(async () => ({ rrsets: [] })) } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ localAuditEvents: vi.fn() }));
vi.mock("@/lib/inventory/service", () => ({ connectionScope: async () => "current-server" }));
vi.mock("@/lib/db/client", () => ({ db: { auditLog: { findMany: vi.fn() } } }));
import { requireActor } from "@/lib/auth/session";
import { localAuditEvents } from "@/lib/audit/service";
import { db } from "@/lib/db/client";
import { GET } from "@/app/api/dns-history/route";
import { dnsHistoryEvents, type HistorySource } from "@/lib/dns/history";
const zone = "example.com.";
const name = "host.example.com.";
const rrset = (content = "192.0.2.1", ttl = 300) => ({ name, type: "A" as const, ttl, records: [{ content, disabled: false }] });
const source = (overrides: Partial<HistorySource> = {}): HistorySource => ({ id: "event", createdAt: "2026-10-03T00:00:00Z", zone, recordName: name, recordType: "A", action: "CREATE_RECORD", success: true, newValue: rrset(), userEmail: "admin@example.com", ...overrides });
const request = (params = "") => GET(new Request(`http://localhost/api/dns-history?zone=example.com${params}`));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "");
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.mocked(localAuditEvents).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it("keeps create, value and TTL changes, deletion and recreation under the same identity", async () => {
  const values = [source({ id: "1" }), source({ id: "2", action: "UPDATE_RECORD", oldValue: rrset(), newValue: rrset("192.0.2.2", 600) }), source({ id: "3", action: "DELETE_RECORD", oldValue: rrset("192.0.2.2", 600), newValue: undefined }), source({ id: "4", newValue: rrset("192.0.2.3") })];
  vi.mocked(localAuditEvents).mockResolvedValue(values as never);
  const response = await request(`&name=${name}&type=a`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const { events, total } = await response.json();
  expect(total).toBe(4);
  expect(events.map((event: { operation: string }) => event.operation)).toEqual(["CREATE", "DELETE", "UPDATE", "CREATE"]);
  expect(events.every((event: { recordName: string; recordType: string }) => event.recordName === name && event.recordType === "A")).toBe(true);
  expect(events[2]).toMatchObject({ before: { ttl: 300 }, after: { ttl: 600, records: [{ content: "192.0.2.2" }] } });
});
it("unwraps approved unit changes and expands whole-zone deletions", () => {
  expect(dnsHistoryEvents(source({ action: "APPLY_UNIT_DNS_REQUEST", oldValue: rrset(), newValue: { rrset: null, requestId: "private" } }))[0]).toMatchObject({ operation: "DELETE", after: null });
  expect(dnsHistoryEvents(source({ action: "APPLY_APPROVED_DNS_RECORD" }))[0].operation).toBe("CREATE");
  const events = dnsHistoryEvents(source({ action: "DELETE_ZONE", oldValue: { rrsets: [rrset(), { ...rrset(), name: "other.example.com.", type: "AAAA" }] }, newValue: undefined }));
  expect(events).toHaveLength(2);
  expect(new Set(events.map((event) => event.id)).size).toBe(2);
  expect(events.every((event) => event.operation === "DELETE")).toBe(true);
});
it("excludes failures, unrelated actions, malformed snapshots and private payloads", () => {
  expect(dnsHistoryEvents(source({ success: false }))).toEqual([]);
  expect(dnsHistoryEvents(source({ action: "APPROVE_DNS_REQUEST" }))).toEqual([]);
  expect(dnsHistoryEvents(source({ newValue: { password: "secret" } }))).toEqual([]);
  expect(JSON.stringify(dnsHistoryEvents(source({ newValue: { ...rrset(), comments: [{ content: "private comment" }], secret: "private" } })))).not.toContain("private");
});
it("denies unprivileged users and filters restricted grants before counting or paging", async () => {
  vi.mocked(localAuditEvents).mockResolvedValue([source(), source({ id: "hidden", newValue: { ...rrset(), name: "hidden.example.com." } })] as never);
  vi.mocked(requireActor).mockResolvedValue({ id: "viewer", email: "viewer@example.com", globalRole: "USER", zoneRoles: { [zone]: "VIEWER" } });
  expect((await request()).status).toBe(404);
  vi.mocked(requireActor).mockResolvedValue({ id: "scoped", email: "scoped@example.com", globalRole: "USER", zoneRoles: { [zone]: "ADMIN" }, zoneGrants: [{ zoneName: zone, role: "ADMIN", resourcePattern: name, allowedRecordTypes: ["A"] }] });
  expect((await (await request()).json()).total).toBe(1);
  expect((await request("&name=hidden&type=A")).status).toBe(404);
});
it("isolates connection scopes while explicitly labeling old unscoped events", async () => {
  vi.mocked(localAuditEvents).mockResolvedValue([source({ id: "legacy" }), source({ id: "current", dnsScope: "current-server" }), source({ id: "other", dnsScope: "other-server" })] as never);
  const { events, total } = await (await request()).json();
  expect(total).toBe(2);
  expect(events.find((event: { id: string }) => event.id === "legacy").legacyScope).toBe(true);
  expect(events.find((event: { id: string }) => event.id === "current").legacyScope).toBe(false);
});
it("searches deleted values, separates types and paginates without truncating history", async () => {
  vi.mocked(localAuditEvents).mockResolvedValue(Array.from({ length: 55 }, (_, index) => source({ id: String(index), action: "DELETE_RECORD", oldValue: rrset(), newValue: null })) as never);
  const { events, total } = await (await request("&q=192.0.2.1&page=2")).json();
  expect(total).toBe(55); expect(events).toHaveLength(5);
  expect((await (await request("&type=AAAA")).json()).total).toBe(0);
  expect((await request("&page=0")).status).toBe(400);
});
it("queries durable production snapshots with the current connection scope", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://unused");
  vi.mocked(db.auditLog.findMany).mockResolvedValue([{ ...source({ dnsScope: "current-server" }), user: { name: "管理員" } }] as never);
  expect((await (await request()).json()).events[0].userName).toBe("管理員");
  expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ zone, success: true, OR: [{ dnsScope: "current-server" }, { dnsScope: null }] }) }));
  expect(localAuditEvents).not.toHaveBeenCalled();
});
