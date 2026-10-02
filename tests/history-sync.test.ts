import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: { auditLog: { findMany: vi.fn(), createMany: vi.fn() } } }));
import { db } from "@/lib/db/client";
import { syncDnsHistory } from "@/lib/dns/history-sync";
import type { RRSet } from "@/lib/dns/types";
const rrset: RRSet = { name: "host.example.com.", type: "A", ttl: 300, records: [{ content: "192.0.2.1", disabled: false }] };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://unused"); vi.mocked(db.auditLog.findMany).mockResolvedValue([]); });
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
  vi.mocked(db.auditLog.findMany).mockResolvedValue([{ id: "old", createdAt: new Date("2026-01-01"), zone: "example.com.", dnsScope: "one", action: "DELETE_RECORD", success: true, oldValue: rrset, newValue: null, userEmail: "admin" }] as never);
  await syncDnsHistory("example.com.", "one", []);
  expect(db.auditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ createdAt: new Date("2026-01-01"), newValue: rrset, userEmail: "PowerDNS（歷史快照補登）" })] }));
});
it("never overwrites an existing initial snapshot", async () => {
  vi.mocked(db.auditLog.findMany).mockResolvedValue([{ id: "sync", createdAt: new Date(), zone: "example.com.", dnsScope: "one", action: "SYNC_RECORD", success: true, newValue: rrset, userEmail: "PowerDNS" }] as never);
  await syncDnsHistory("example.com.", "one", [{ ...rrset, ttl: 600 }]);
  expect(db.auditLog.createMany).not.toHaveBeenCalled();
});
