import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: { auditLog: { findMany: vi.fn(), createMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() } }));
import { db } from "@/lib/db/client";
import { syncDnsHistory } from "@/lib/dns/history-sync";
import type { RRSet } from "@/lib/dns/types";
const rrset: RRSet = { name: "host.example.com.", type: "A", ttl: 300, records: [{ content: "192.0.2.1", disabled: false }] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) => (fn as (tx: typeof db) => unknown)(db) as never); vi.mocked(db.$queryRaw).mockResolvedValue([]); vi.stubEnv("DATABASE_URL", "postgresql://unused"); vi.mocked(db.auditLog.findMany).mockResolvedValue([]); });
it("persists a sanitized first snapshot with an id unique to the connection and identity", async () => {
  await syncDnsHistory("example.com.", "one", [{ ...rrset, comments: [{ content: "private" }] }]);
  const first = vi.mocked(db.auditLog.createMany).mock.calls[0][0]!;
  expect(first).toMatchObject({ skipDuplicates: true, data: [{ action: "SYNC_RECORD", dnsScope: "one", newValue: rrset }] });
  expect(JSON.stringify(first)).not.toContain("private");
  await syncDnsHistory("example.com.", "one", [{ ...rrset, ttl: 600 }]);
  const second = vi.mocked(db.auditLog.createMany).mock.calls[1][0]!;
  expect((second.data as { id: string }[])[0].id).toBe((first.data as { id: string }[])[0].id);
  await syncDnsHistory("example.com.", "two", [rrset]);
  expect((vi.mocked(db.auditLog.createMany).mock.calls[2][0]!.data as { id: string }[])[0].id).not.toBe((first.data as { id: string }[])[0].id);
});
it("backfills from the earliest saved state instead of current PowerDNS, including deleted records", async () => {
  vi.mocked(db.$queryRaw).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "old", createdAt: new Date("2026-01-01"), zone: "example.com.", dnsScope: "one", action: "DELETE_RECORD", success: true, oldValue: rrset, newValue: null, userEmail: "admin" }] as never);
  await syncDnsHistory("example.com.", "one", []);
  expect(db.auditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ createdAt: new Date("2026-01-01"), newValue: rrset, userEmail: "PowerDNS（歷史快照補登）" })] }));
});
it("never overwrites an existing initial snapshot", async () => {
  await syncDnsHistory("example.com.", "one", [rrset]);
  const id = (vi.mocked(db.auditLog.createMany).mock.calls[0][0]!.data as { id: string }[])[0].id;
  vi.mocked(db.auditLog.createMany).mockClear();
  vi.mocked(db.auditLog.findMany).mockResolvedValue([{ id }] as never);
  await syncDnsHistory("example.com.", "one", [{ ...rrset, ttl: 600 }]);
  expect(db.auditLog.createMany).not.toHaveBeenCalled();
});

it("does not treat ownership edits as DNS baselines", async () => {
  vi.mocked(db.$queryRaw).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "metadata", createdAt: new Date("2026-01-01"), zone: "example.com.", recordName: rrset.name, recordType: "A", dnsScope: "one", action: "UPDATE_DNS_OWNERSHIP", success: true, newValue: { purpose: "網站" }, userEmail: "admin" }] as never);
  await syncDnsHistory("example.com.", "one", [rrset]);
  expect(db.auditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ newValue: rrset, userEmail: "PowerDNS" })] }));
});

it("checks only baseline ids after backfill and never reloads full historical snapshots", async () => {
  await syncDnsHistory("example.com.", "one", [rrset]);
  const candidate = vi.mocked(db.auditLog.findMany).mock.calls[0][0]!;
  expect(candidate).toMatchObject({ select: { id: true }, where: { id: { in: [expect.stringContaining("dns-sync-")] } } });
  vi.mocked(db.auditLog.findMany).mockClear();
  vi.mocked(db.auditLog.createMany).mockClear();
  vi.mocked(db.auditLog.findMany).mockResolvedValue([{ id: (candidate.where!.id as { in: string[] }).in[0] }] as never);
  vi.mocked(db.$queryRaw).mockClear();
  await syncDnsHistory("example.com.", "one", [rrset]);
  expect(db.auditLog.findMany).toHaveBeenCalledWith(candidate);
  expect(db.auditLog.createMany).not.toHaveBeenCalled();
  expect(db.$queryRaw).toHaveBeenCalledTimes(2); // Lock, then only unsynchronized historical identities.
  expect(vi.mocked(db.$queryRaw).mock.calls[1][0]).toMatchObject({ sql: expect.stringContaining("NOT EXISTS") });
});
