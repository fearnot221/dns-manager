import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasourceUrl: process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused" }) };
});
import { db } from "@/lib/db/client";
import { queryDnsHistory } from "@/lib/dns/history-query";
import { syncDnsHistory } from "@/lib/dns/history-sync";
import { dnsHistoryEvents, type HistorySource } from "@/lib/dns/history";
import { createIdleSession, readIdleSession } from "@/lib/auth/idle-session";
import type { Actor, RRSet } from "@/lib/dns/types";

const url = process.env.UNIT_TEST_DATABASE_URL;
const admin: Actor = { id: "test-reader", email: "reader@example.invalid", globalRole: "ADMIN", zoneRoles: {} };
let zone: string;
const rrset = (name = `host.${zone}`, type: "A" | "AAAA" = "A"): RRSet => ({ name, type, ttl: 300, records: [{ content: type === "A" ? "192.0.2.1" : "2001:db8::1", disabled: false }] });
const query = (input = {}, actor = admin) => queryDnsHistory(actor, zone, "current", { name: "", type: "", q: "", page: 1, ...input });
async function save(overrides: Partial<HistorySource> = {}) {
  return db.auditLog.create({ data: {
    id: crypto.randomUUID(), zone, recordName: `host.${zone}`, recordType: "A", userEmail: admin.email, dnsScope: "current",
    action: "CREATE_RECORD", success: true, newValue: rrset() as unknown as Prisma.InputJsonValue,
    ...overrides, createdAt: new Date(overrides.createdAt ?? Date.now()),
    ...(overrides.oldValue === null ? { oldValue: Prisma.JsonNull } : {}),
    ...(overrides.newValue === null ? { newValue: Prisma.JsonNull } : {}),
  } as Prisma.AuditLogUncheckedCreateInput });
}

describe.skipIf(!url)("audit fixes with isolated PostgreSQL", () => {
  beforeAll(() => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/dns_units_test") throw new Error("Use a disposable localhost dns_units_test database only");
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(() => { zone = `${crypto.randomUUID()}.example.com.`; });
  afterAll(async () => { await db.$disconnect(); vi.unstubAllEnvs(); });

  it("filters and pages expanded zone deletions before returning at most 50 events", async () => {
    const rows = [];
    for (let i = 0; i < 60; i++) rows.push(await save({ createdAt: new Date(1700000000000 + i), newValue: rrset() }));
    rows.push(await save({ id: crypto.randomUUID(), action: "DELETE_ZONE", recordName: null, recordType: null, oldValue: { rrsets: [rrset(), rrset(`other.${zone}`, "AAAA")] }, newValue: null }));
    const expected = rows.flatMap(row => dnsHistoryEvents({ ...row, userName: null })).filter(e => e.recordName === `host.${zone}` && e.recordType === "A").sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const first = await query({ name: `host.${zone}`, type: "A" });
    const second = await query({ name: `host.${zone}`, type: "A", page: 2 });
    expect(first.total).toBe(61); expect(first.events).toHaveLength(50);
    expect(second.total).toBe(61); expect(second.events).toHaveLength(11);
    expect([...first.events, ...second.events]).toEqual(expected);
    expect((await query({ name: `host.${zone}`, type: "A", page: 3 }))).toEqual({ total: 61, events: [] });
  });

  it("keeps scope, malformed-event, search and sanitized ownership behavior", async () => {
    await save({ dnsScope: "other" });
    await save({ success: false });
    await save({ action: "CREATE_RECORD", newValue: { name: "invalid", records: "invalid" } });
    const legacy = await save({ dnsScope: null, action: "DELETE_RECORD", oldValue: rrset(), newValue: null });
    const inspection = await save({ action: "INSPECT_DNS_RECORD", oldValue: { purpose: "原用途" }, newValue: { purpose: "研究網站", secret: "private-token", inspections: [{ note: "private-note" }] } });
    // A malformed replacement of the same field must not hide a valid earlier value.
    const changed = await save({ action: "UPDATE_DNS_OWNERSHIP", oldValue: { purpose: "舊網站" }, newValue: { purpose: 123 } });
    const applied = await save({ action: "APPLY_UNIT_DNS_REQUEST", oldValue: rrset(), newValue: { rrset: { ...rrset(), records: [{ content: "192.0.2.2", disabled: false }] }, requestId: "private-request" } });
    expect((await query()).total).toBe(4);
    expect((await query({ q: "192.0.2.2" })).events).toEqual(dnsHistoryEvents({ ...applied, userName: null }));
    expect((await query({ q: "研究網站" })).events).toEqual(dnsHistoryEvents({ ...inspection, userName: null }));
    expect((await query({ q: "舊網站" })).events).toEqual(dnsHistoryEvents({ ...changed, userName: null }));
    expect((await query({ q: "private" })).total).toBe(0);
    expect((await query({ q: "192.0.2.1" })).events).toEqual(expect.arrayContaining(dnsHistoryEvents({ ...legacy, userName: null })));
    expect(JSON.stringify((await query()).events)).not.toContain("private");
    expect((await query({ q: "%_" })).total).toBe(0); // Search characters are literal, not SQL patterns.
  });

  it("matches scoped grants before counting, including wildcard descendants and types", async () => {
    const names = [`lab.${zone}`, `a.lab.${zone}`, `nested.a.lab.${zone}`, `hidden.${zone}`, `evil${zone}`];
    await save({ action: "DELETE_ZONE", oldValue: { rrsets: names.flatMap(name => [rrset(name), rrset(name, "AAAA")]) }, newValue: null });
    const scoped: Actor = { ...admin, globalRole: "USER", zoneRoles: { [zone]: "ADMIN" }, zoneGrants: [
      { zoneName: zone, role: "ADMIN", resourcePattern: `*.lab.${zone}`, allowedRecordTypes: ["A"] },
      { zoneName: zone, role: "ADMIN", resourcePattern: `hidden.${zone}`, allowedRecordTypes: ["AAAA"] },
    ] };
    const result = await query({}, scoped);
    expect(result.total).toBe(3);
    expect(result.events.map(e => [e.recordName, e.recordType])).toEqual(expect.arrayContaining([[names[1], "A"], [names[2], "A"], [names[3], "AAAA"]]));
    expect((await query({}, { ...scoped, zoneGrants: [{ zoneName: zone, role: "ADMIN", resourcePattern: "*.outside.invalid.", allowedRecordTypes: [] }] })).total).toBe(0);
    expect((await query({}, { ...scoped, zoneGrants: [{ zoneName: zone, role: "ADMIN", resourcePattern: null, allowedRecordTypes: [] }] })).total).toBe(8);
    expect((await query({}, { ...scoped, zoneGrants: [] })).total).toBe(0);
  });

  it("backfills unseen deleted values and reads only ids once baselines exist", async () => {
    await syncDnsHistory(zone, "current", []);
    const before = rrset();
    await save({ action: "DELETE_RECORD", oldValue: before, newValue: null });
    await syncDnsHistory(zone, "current", []);
    expect(await db.auditLog.count({ where: { zone, action: "SYNC_RECORD" } })).toBe(1);
    const original = await db.auditLog.findFirstOrThrow({ where: { zone, action: "SYNC_RECORD" } });
    await syncDnsHistory(zone, "current", [{ ...before, ttl: 600 }]);
    expect(await db.auditLog.findFirstOrThrow({ where: { id: original.id } })).toEqual(original);
    expect(await db.auditLog.count({ where: { zone, action: "SYNC_RECORD" } })).toBe(1);
    await syncDnsHistory(zone, "other", [before]);
    expect(await db.auditLog.count({ where: { zone, action: "SYNC_RECORD" } })).toBe(2);
  });

  it("removes expired sessions while preserving active sessions and the new login", async () => {
    const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@session-test.invalid` } });
    const now = Date.now();
    const expired = crypto.randomUUID(), boundary = crypto.randomUUID(), active = crypto.randomUUID(), fresh = crypto.randomUUID();
    await db.session.createMany({ data: [
      { sessionToken: expired, userId: user.id, expires: new Date(now - 1) },
      { sessionToken: boundary, userId: user.id, expires: new Date(now) },
      { sessionToken: active, userId: user.id, expires: new Date(now + 60000) },
    ] });
    await createIdleSession(fresh, user.id, now);
    expect((await db.session.findMany({ where: { userId: user.id } })).map(row => row.sessionToken).sort()).toEqual([active, fresh].sort());
    expect(await readIdleSession(active, now)).toBe(now + 60000);
    expect(await readIdleSession(fresh, now)).toBe(now + 900000);
  });
});
