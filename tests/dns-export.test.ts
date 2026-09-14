import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { listZones: vi.fn(), getZone: vi.fn() } }));
vi.mock("@/lib/inventory/service", () => ({ describeRecords: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
import { POST } from "@/app/api/admin/dns-export/route";
import { requireActor, AuthError } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { describeRecords } from "@/lib/inventory/service";
import { logAuditEvent } from "@/lib/audit/service";
import { csvCell, csvRow, dnsCsvHeaders } from "@/lib/dns/csv";
import type { Actor, Zone } from "@/lib/dns/types";

const request = (origin = "http://localhost:3000") => new Request("http://localhost:3000/api/admin/dns-export", { method: "POST", headers: { Origin: origin } });
const makeZone = (name: string): Zone => ({ id: name, name, kind: "Native", serial: 123, dnssec: true, rrsets: [{ name, type: "TXT", ttl: 300, records: [{ content: '"hello, world"', disabled: true }, { content: '"second value"', disabled: false }], comments: [{ content: "備註" }] }] });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.mocked(logAuditEvent).mockResolvedValue(undefined);
  vi.mocked(powerdns.listZones).mockResolvedValue([makeZone("example.com."), makeZone("2.0.192.in-addr.arpa."), makeZone("8.b.d.0.1.0.0.2.ip6.arpa.")]);
  vi.mocked(powerdns.getZone).mockImplementation(async (name) => makeZone(name));
  vi.mocked(describeRecords).mockImplementation(async (_actor, zoneName, rrsets) => rrsets.flatMap((set) => set.records.map((record) => ({ zoneName, recordName: set.name, recordType: set.type, content: record.content, ttl: set.ttl, disabled: record.disabled, ownership: { id: "record", applicantName: "申請人", applicantEmail: "person@example.com", applicantUnit: "實驗室", applicantExtension: "1234", purpose: "研究\nDNS", updatedAt: null, updatedBy: "", inspections: [] } }))));
});
describe("CSV encoding", () => {
  it("escapes quotes, commas, Unicode and newlines, with consistent CRLF rows", () => {
    expect(csvRow(['中文,"x"\nnext', "", 300])).toBe('"中文,""x""\nnext","","300"\r\n');
    expect(csvCell(null)).toBe('""');
  });
  it("neutralizes spreadsheet formulas, including whitespace and control prefixes", () => {
    for (const value of ["=1+1", "+cmd", "-1+1", "@SUM(A1)", "  =1", "\t=1", "\rtext", "\u0000=1"]) expect(csvCell(value).startsWith('"\'')).toBe(true);
    expect(csvCell("host.example.com.")).toBe('"host.example.com."');
  });
});
describe("admin DNS export", () => {
  it("requires authentication and rejects users and scoped zone admins before DNS access", async () => {
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await POST(request())).status).toBe(401);
    const roles: Actor["zoneRoles"][] = [{}, { "example.com.": "ADMIN" }];
    for (const zoneRoles of roles) {
      vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles });
      expect((await POST(request())).status).toBe(403);
    }
    expect(powerdns.listZones).not.toHaveBeenCalled();
  });
  it("blocks cross-origin downloads", async () => {
    expect((await POST(request("https://other.invalid"))).status).toBe(403);
    expect(powerdns.listZones).not.toHaveBeenCalled();
  });
  it("exports all categories and every record value, including disabled records and ownership", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="dns-records-.*\.csv"$/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const csv = new TextDecoder().decode(bytes);
    for (const name of ["example.com.", "2.0.192.in-addr.arpa.", "8.b.d.0.1.0.0.2.ip6.arpa.", "申請人", "實驗室", "person@example.com", "second value"]) expect(csv).toContain(name);
    expect(powerdns.getZone).toHaveBeenCalledTimes(3);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "EXPORT_ALL_DNS_CSV", after: { zoneCount: 3, recordCount: 6, format: "csv" }, success: true }));
  });
  it("returns a valid header-only CSV when there are no zones", async () => {
    vi.mocked(powerdns.listZones).mockResolvedValue([]);
    expect(await (await POST(request())).text()).toBe(csvRow(dnsCsvHeaders));
  });
  it("fails instead of downloading partial data if any zone fetch fails", async () => {
    vi.mocked(powerdns.getZone).mockRejectedValue(new Error("offline"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(logAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ action: "EXPORT_ALL_DNS_CSV", success: true }));
  });
  it("does not release a file if the export audit cannot be saved", async () => {
    vi.mocked(logAuditEvent).mockImplementation(async (input) => { if (input.action === "EXPORT_ALL_DNS_CSV") throw new Error("audit unavailable"); });
    expect((await POST(request())).status).toBe(500);
  });
});
