import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/units/service", () => ({ createUnit: vi.fn(), joinUnit: vi.fn(), listUnits: vi.fn(), manageUnit: vi.fn() }));
vi.mock("@/lib/units/records", () => ({ unitDetail: vi.fn(), requestUnitChange: vi.fn() }));
vi.mock("@/lib/requests/dev-store", () => ({ isDevRequestStore: () => false }));
vi.mock("@/lib/db/client", () => ({ db: { dnsRecordRequest: { findMany: vi.fn() } } }));
import { requireActor, AuthError } from "@/lib/auth/session";
import { createUnit, joinUnit, listUnits, manageUnit } from "@/lib/units/service";
import { requestUnitChange } from "@/lib/units/records";
import { GET, POST } from "@/app/api/units/route";
import { PATCH } from "@/app/api/units/[id]/route";
import { POST as change } from "@/app/api/units/[id]/changes/route";
import { GET as requests } from "@/app/api/dns-requests/route";
import { db } from "@/lib/db/client";
const ctx = { params: Promise.resolve({ id: "unit-1" }) };
const req = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/units", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "private@example.com", globalRole: "USER", zoneRoles: {} });
  vi.mocked(listUnits).mockResolvedValue([]);
});
describe("unit API boundaries", () => {
  it("requires authentication before unit discovery or writes", async () => {
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await GET()).status).toBe(401);
    expect((await POST(req({ action: "create", name: "Lab" }))).status).toBe(401);
    expect(listUnits).not.toHaveBeenCalled(); expect(createUnit).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before any unit action", async () => {
    expect((await POST(req({ action: "create", name: "Lab" }, "https://evil.invalid"))).status).toBe(403);
    expect((await PATCH(req({ action: "rotate" }, "https://evil.invalid"), ctx)).status).toBe(403);
    expect((await change(req({}, "https://evil.invalid"), ctx)).status).toBe(403);
    expect(createUnit).not.toHaveBeenCalled(); expect(manageUnit).not.toHaveBeenCalled(); expect(requestUnitChange).not.toHaveBeenCalled();
  });
  it("rejects forged join roles and change targets, TTL and approval flags", async () => {
    expect((await POST(req({ action: "join", passcode: "a".repeat(32), role: "ADMIN" }))).status).toBe(400);
    expect(joinUnit).not.toHaveBeenCalled();
    const body = { recordId: "record", expectedHash: "hash".repeat(10), content: "192.0.2.2", purpose: "move" };
    for (const extra of [{ ttl: 1 }, { name: "other.example.com" }, { approved: true }, { unitId: "other" }]) expect((await change(req({ ...body, ...extra }), ctx)).status).toBe(400);
    expect(requestUnitChange).not.toHaveBeenCalled();
  });
  it("does not cache unit discovery or one-time invitations", async () => {
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
    vi.mocked(createUnit).mockResolvedValue({ unit: { id: "unit-1", name: "Lab" }, passcode: "x".repeat(32) });
    expect((await POST(req({ action: "create", name: "Lab" }))).headers.get("Cache-Control")).toBe("no-store");
  });
  it("omits RRset snapshots and server connection details from shared request responses", async () => {
    vi.mocked(db.dnsRecordRequest.findMany).mockResolvedValue([{ id: "r", userId: "user", user: { id: "user", name: "王小明", email: "opaque@accounts.invalid", portalEmail: "student@example.com" }, unitId: "unit-1", status: "PENDING", zoneName: "example.com.", expectedRRSet: { content: "unrelated-private-record" }, connectionScope: "internal-server" }] as never);
    const response = await requests();
    const text = await response.text();
    expect(text).not.toContain("unrelated-private-record"); expect(text).not.toContain("internal-server");
    expect(JSON.parse(text).requests[0].canReview).toBe(false);
    expect(JSON.parse(text).requests[0].user).toEqual({ id: "user", name: "王小明", email: "student@example.com" });
    expect(text).not.toContain("@accounts.invalid");
    expect(text).not.toContain("portalEmail");
    expect(vi.mocked(db.dnsRecordRequest.findMany).mock.calls[0][0]?.where).toMatchObject({ OR: [{ userId: "user" }, { unit: { members: { some: { userId: "user" } } } }] });
    vi.mocked(requireActor).mockResolvedValue({ id: "scoped-admin", email: "scoped@example.com", globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
    expect((await (await requests()).json()).requests[0].canReview).toBe(false);
  });
});
