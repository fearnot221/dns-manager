import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/units/allowlist", () => ({ manageAllowlist: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/units/service", () => ({ createUnit: vi.fn(), listUnits: vi.fn(), manageUnit: vi.fn(), assignUnitManager: vi.fn(), editUnit: vi.fn() }));
vi.mock("@/lib/units/records", () => ({ unitDetail: vi.fn(), requestUnitChange: vi.fn(), inspectUnitRecord: vi.fn() }));
vi.mock("@/lib/requests/dev-store", () => ({ isDevRequestStore: () => false }));
vi.mock("@/lib/db/client", () => ({ db: { $transaction:vi.fn(async (operations)=>Promise.all(operations)), dnsRecordRequest: { findMany: vi.fn(), count:vi.fn(async()=>1), groupBy:vi.fn(async()=>[{status:"PENDING",_count:{_all:1}}]) } } }));
import { requireActor, AuthError } from "@/lib/auth/session";
import { manageAllowlist } from "@/lib/units/allowlist";
import { createUnit, listUnits, manageUnit, assignUnitManager, editUnit } from "@/lib/units/service";
import { inspectUnitRecord, requestUnitChange } from "@/lib/units/records";
import { GET, POST } from "@/app/api/units/route";
import { PATCH } from "@/app/api/units/[id]/route";
import { POST as change } from "@/app/api/units/[id]/changes/route";
import { POST as inspect } from "@/app/api/units/[id]/inspections/route";
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
    expect((await POST(req({ action: "create", name: "Lab", managerStudentId: "115000001" }))).status).toBe(401);
    expect(listUnits).not.toHaveBeenCalled(); expect(createUnit).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before any unit action", async () => {
    expect((await POST(req({ action: "create", name: "Lab", managerStudentId: "115000001" }, "https://evil.invalid"))).status).toBe(403);
    expect((await PATCH(req({ action: "rotate" }, "https://evil.invalid"), ctx)).status).toBe(403);
    expect((await change(req({}, "https://evil.invalid"), ctx)).status).toBe(403);
    expect(createUnit).not.toHaveBeenCalled(); expect(manageUnit).not.toHaveBeenCalled(); expect(requestUnitChange).not.toHaveBeenCalled();
  });
  it("rejects forged join roles and change targets, TTL and approval flags", async () => {
    expect((await POST(req({ action: "join", passcode: "a".repeat(32), role: "ADMIN" }))).status).toBe(400);
    expect((await POST(req({ action: "join", passcode: "a".repeat(32) }))).status).toBe(400);
    expect((await PATCH(req({ action: "rotate" }), ctx)).status).toBe(400);
    const body = { recordId: "record", expectedHash: "hash".repeat(10), content: "192.0.2.2", purpose: "move" };
    for (const extra of [{ ttl: 1 }, { name: "other.example.com" }, { approved: true }, { unitId: "other" }]) expect((await change(req({ ...body, ...extra }), ctx)).status).toBe(400);
    expect(requestUnitChange).not.toHaveBeenCalled();
  });
  it("validates allowlist mutations without accepting role escalation", async () => {
    for (const body of [{ action: "allowlist", studentId: " " }, { action: "allowlist", studentId: "115000001", role: "ADMIN" }]) expect((await PATCH(req(body), ctx)).status).toBe(400);
    expect((await PATCH(req({ action: "allowlist", studentId: "115000001" }, "https://evil.invalid"), ctx)).status).toBe(403);
    expect(manageAllowlist).not.toHaveBeenCalled();
    vi.mocked(manageAllowlist).mockResolvedValue({ saved: true });
    expect((await PATCH(req({ action: "allowlist", studentId: " 115000001 " }), ctx)).status).toBe(200);
    expect(manageAllowlist).toHaveBeenCalledWith(expect.objectContaining({ id: "user" }), "unit-1", "115000001", false);
  });
  it("does not cache unit discovery or one-time invitations", async () => {
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
    vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
    vi.mocked(createUnit).mockResolvedValue({ unit: { id: "unit-1", name: "Lab", status: "APPROVED" } });
    expect((await POST(req({ action: "create", name: "Lab", managerStudentId: "115000001" }))).headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects ordinary and zone admin creation and student-id assignment before service calls", async () => {
    for (const zoneRoles of [{}, { "example.com.": "ADMIN" }] as Record<string, "ADMIN">[]) {
      vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles });
      expect((await POST(req({ action: "create", name: "Lab", managerStudentId: "115000001" }))).status).toBe(403);
      expect((await PATCH(req({ action: "assign-manager", studentId: "115000001" }), ctx)).status).toBe(403);
    }
    expect(createUnit).not.toHaveBeenCalled(); expect(assignUnitManager).not.toHaveBeenCalled();
  });
  it("validates the target student and routes admin assignment without accepting global role fields", async () => {
    vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
    vi.mocked(assignUnitManager).mockResolvedValue({ saved: true });
    for (const managerStudentId of [undefined, " "]) expect((await POST(req({ action: "create", name: "Lab", managerStudentId }))).status).toBe(400);
    for (const body of [{ action: "assign-manager", studentId: " " }, { action: "assign-manager", studentId: "115000001", globalRole: "ADMIN" }]) expect((await PATCH(req(body), ctx)).status).toBe(400);
    expect((await PATCH(req({ action: "assign-manager", studentId: "115000001" }, "https://evil.invalid"), ctx)).status).toBe(403);
    expect(assignUnitManager).not.toHaveBeenCalled();
    const response = await PATCH(req({ action: "assign-manager", studentId: " 115000001 " }), ctx);
    expect(response.status).toBe(200);
    expect(assignUnitManager).toHaveBeenCalledWith(expect.objectContaining({ id: "admin" }), "unit-1", "115000001");
    expect(manageUnit).not.toHaveBeenCalled();
  });
  it("omits RRset snapshots and server connection details from shared request responses", async () => {
    vi.mocked(db.dnsRecordRequest.findMany).mockResolvedValue([{ id: "r", userId: "user", user: { id: "user", name: "王小明", email: "opaque@accounts.invalid", portalEmail: "student@example.com" }, unitId: "unit-1", status: "PENDING", zoneName: "example.com.", expectedRRSet: { content: "unrelated-private-record" }, connectionScope: "internal-server" }] as never);
    const response = await requests();
    const text = await response.text();
    expect(text).not.toContain("unrelated-private-record"); expect(text).not.toContain("internal-server");
    expect(JSON.parse(text).requests[0].canReview).toBe(false);
    expect(JSON.parse(text).requests[0].user).toEqual({ id: "user", name: "王小明", email: null });
    expect(text).not.toContain("@accounts.invalid");
    expect(text).not.toContain("portalEmail");
    expect(vi.mocked(db.dnsRecordRequest.findMany).mock.calls[0][0]?.take).toBe(101); // Real object-level isolation is exercised in security-boundaries.integration.test.ts.
    vi.mocked(requireActor).mockResolvedValue({ id: "scoped-admin", email: "scoped@example.com", globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
    expect((await (await requests()).json()).requests[0].canReview).toBe(false);
  });
  it("validates deletion and inspection inputs, authentication and origin", async () => {
    const deletion = { operation: "DELETE", recordId: "record", expectedHash: "a".repeat(64), purpose: "退役" };
    const inspection = { recordId: "record", expectedHash: "a".repeat(64), note: "確認" };
    vi.mocked(requestUnitChange).mockResolvedValue({ id: "request" });
    vi.mocked(inspectUnitRecord).mockResolvedValue({ id: "inspection" });
    expect((await change(req(deletion), ctx)).status).toBe(201);
    expect((await inspect(req(inspection), ctx)).status).toBe(201);
    expect(inspectUnitRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "user" }), "unit-1", inspection);
    for (const extra of [{ content: "forged" }, { approved: true }, { unitId: "other" }]) expect((await change(req({ ...deletion, ...extra }), ctx)).status).toBe(400);
    for (const extra of [{ inspectorId: "admin" }, { inspectedAt: "2000-01-01" }, { unitId: "other" }]) expect((await inspect(req({ ...inspection, ...extra }), ctx)).status).toBe(400);
    expect((await inspect(req(inspection, "https://evil.invalid"), ctx)).status).toBe(403);
    expect((await change(req(deletion, "https://evil.invalid"), ctx)).status).toBe(403);
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await inspect(req(inspection), ctx)).status).toBe(401);
    expect((await change(req(deletion), ctx)).status).toBe(401);
    expect(inspectUnitRecord).toHaveBeenCalledOnce(); expect(requestUnitChange).toHaveBeenCalledOnce();
  });

  it("validates requested ownership without allowing unit assignment or inspection forgery", async () => {
    const body = { recordId: "record", expectedHash: "a".repeat(64), content: "192.0.2.2", purpose: "搬遷", ownership: { expectedUpdatedAt: "2026-09-29T00:00:00.000Z", applicantName: "聯絡人", applicantEmail: "dns@example.com", applicantExtension: "1234", purpose: "網站" } };
    for (const extra of [{ unitId: "other" }, { applicantUnit: "other" }, { inspections: [] }, { applicantEmail: "invalid" }]) expect((await change(req({ ...body, ownership: { ...body.ownership, ...extra } }), ctx)).status).toBe(400);
    expect(requestUnitChange).not.toHaveBeenCalled();
    vi.mocked(requestUnitChange).mockResolvedValue({ id: "r" });
    expect((await change(req(body), ctx)).status).toBe(201);
    expect(requestUnitChange).toHaveBeenCalledWith(expect.anything(), "unit-1", body);
  });

  it("validates complete inspection metadata without accepting unit reassignment", async () => {
    const body = { recordId: "record", expectedHash: "a".repeat(64), note: "已確認", ownership: { expectedUpdatedAt: "2026-09-29T00:00:00.000Z", applicantName: "聯絡人", applicantEmail: "dns@example.com", applicantExtension: "1234", purpose: "網站" } };
    for (const extra of [{ unitId: "other" }, { applicantUnit: "other" }, { applicantEmail: "invalid" }, { purpose: "a".repeat(1001) }]) expect((await inspect(req({ ...body, ownership: { ...body.ownership, ...extra } }), ctx)).status).toBe(400);
    expect(inspectUnitRecord).not.toHaveBeenCalled();
    vi.mocked(inspectUnitRecord).mockResolvedValue({ id: "i" });
    expect((await inspect(req(body), ctx)).status).toBe(201);
    expect(inspectUnitRecord).toHaveBeenCalledWith(expect.anything(), "unit-1", body);
  });

  it("rejects retired unit approval actions even for system admins", async () => {
    vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
    for (const decision of ["APPROVE", "REJECT"]) expect((await PATCH(req({ action: "review", decision }), ctx)).status).toBe(400);
    expect(manageUnit).not.toHaveBeenCalled(); expect(assignUnitManager).not.toHaveBeenCalled();
  });

});

it("restricts unit rename and deletion to system admins and validates input", async () => {
  for (const body of [{ action: "rename", name: "Lab" }, { action: "delete" }]) expect((await PATCH(req(body), ctx)).status).toBe(403);
  expect(editUnit).not.toHaveBeenCalled();
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.mocked(editUnit).mockResolvedValue({ saved: true });
  for (const body of [{ action: "rename", name: " " }, { action: "rename", name: "x".repeat(101) }, { action: "delete", force: true }]) expect((await PATCH(req(body), ctx)).status).toBe(400);
  expect((await PATCH(req({ action: "delete" }, "https://evil.invalid"), ctx)).status).toBe(403);
  expect(editUnit).not.toHaveBeenCalled();
  expect((await PATCH(req({ action: "rename", name: " Lab " }), ctx)).status).toBe(200);
  expect(editUnit).toHaveBeenLastCalledWith(expect.objectContaining({ id: "admin" }), "unit-1", { action: "rename", name: "Lab" });
  expect((await PATCH(req({ action: "delete" }), ctx)).status).toBe(200);
});

it("accepts member/admin roles and removal but rejects the retired viewer role", async () => {
  expect((await PATCH(req({ action: "member", userId: "member", role: "VIEWER" }), ctx)).status).toBe(400);
  expect(manageUnit).not.toHaveBeenCalled();
  vi.mocked(manageUnit).mockResolvedValue({ saved: true });
  for (const role of ["EDITOR", "ADMIN", null]) {
    expect((await PATCH(req({ action: "member", userId: "member", role }), ctx)).status).toBe(200);
    expect(manageUnit).toHaveBeenLastCalledWith(expect.anything(), "unit-1", { action: "member", userId: "member", role });
  }
});
