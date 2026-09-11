import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { listZones: vi.fn() } }));
vi.mock("@/lib/requests/save-application", () => ({ saveApplication: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
import { AuthError, requireActor } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { PowerDNSError } from "@/lib/powerdns/errors";
import { saveApplication } from "@/lib/requests/save-application";
import { GET } from "@/app/api/dns-requests/zones/route";
import { POST } from "@/app/api/dns-requests/route";

const body = { applicantName: "測試申請人", applicantUnit: "測試單位", applicantExtension: "1234", records: [{ zoneName: "example.com", name: "test", type: "A", ttl: 300, content: "192.0.2.10" }] };
const request = (input: unknown) => new Request("http://localhost:3000/api/dns-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
  vi.mocked(powerdns.listZones).mockResolvedValue([{ id: "secret-id", name: "example.com.", kind: "Native", serial: 123, dnssec: true, rrsets: [{ name: "private.example.com.", type: "A", ttl: 300, records: [{ content: "10.0.0.1", disabled: false }] }] }]);
  vi.mocked(saveApplication).mockResolvedValue({ applicationId: "batch-id", count: 1 });
});
describe("application API boundaries", () => {
  it("offers zone names to signed-in users without exposing DNS contents or server metadata", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ zones: [{ name: "example.com." }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires authentication before reading PowerDNS or saving", async () => {
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await GET()).status).toBe(401);
    expect((await POST(request(body))).status).toBe(401);
    expect(powerdns.listZones).not.toHaveBeenCalled();
    expect(saveApplication).not.toHaveBeenCalled();
  });
  it("returns an empty list when PowerDNS has no zones", async () => {
    vi.mocked(powerdns.listZones).mockResolvedValue([]);
    expect(await (await GET()).json()).toEqual({ zones: [] });
    expect((await POST(request(body))).status).toBe(400);
    expect(saveApplication).not.toHaveBeenCalled();
  });
  it("does not fall back to fake zone data when live PowerDNS fails", async () => {
    vi.mocked(powerdns.listZones).mockRejectedValue(new PowerDNSError("Unable to connect to DNS server", 502));
    expect((await GET()).status).toBe(502);
    expect((await POST(request(body))).status).toBe(502);
    expect(saveApplication).not.toHaveBeenCalled();
  });
  it("revalidates the selected zone before saving a batch", async () => {
    const response = await POST(request({ ...body, records: [{ ...body.records[0], zoneName: "forged.example" }] }));
    expect(response.status).toBe(400);
    expect(saveApplication).not.toHaveBeenCalled();
  });
  it("rejects missing contact fields and malformed JSON", async () => {
    expect((await POST(request({ records: body.records }))).status).toBe(400);
    expect((await POST(new Request("http://localhost:3000/api/dns-requests", { method: "POST", body: "{" }))).status).toBe(400);
    expect(saveApplication).not.toHaveBeenCalled();
  });
  it("saves one normalized application and returns the total record count", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ applicationId: "batch-id", count: 1 });
    expect(saveApplication).toHaveBeenCalledOnce();
    expect(vi.mocked(saveApplication).mock.calls[0][1].records[0].recordName).toBe("test.example.com.");
  });
});
