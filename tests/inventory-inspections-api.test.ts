import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/inventory/inspections", () => ({ deleteInspection: vi.fn() }));
import { requireActor, AuthError } from "@/lib/auth/session";
import { deleteInspection } from "@/lib/inventory/inspections";
import { DELETE } from "@/app/api/inventory/inspections/[id]/route";
const owner = { id: "owner", email: "owner@example.com", globalRole: "SUPER_ADMIN" as const, portalIdentifier: "115502532", zoneRoles: {} };
const input = { recordId: "a".repeat(64), expectedUpdatedAt: "2026-09-29T00:00:00.000Z" };
const context = { params: Promise.resolve({ id: "inspection" }) };
const request = (body: unknown = input, origin = "http://localhost") => new Request("http://localhost/api/inventory/inspections/inspection", { method: "DELETE", headers: { Origin: origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue(owner); vi.mocked(deleteInspection).mockResolvedValue({ success: true }); });
it("rejects unauthenticated and non-owner callers, including historical SUPER_ADMIN", async () => {
  vi.mocked(requireActor).mockRejectedValue(new AuthError());
  expect((await DELETE(request(), context)).status).toBe(401);
  for (const actor of [{ ...owner, globalRole: "ADMIN" as const }, { ...owner, portalIdentifier: null }, { ...owner, globalRole: "USER" as const, zoneRoles: { "example.com.": "ADMIN" as const } }]) {
    vi.mocked(requireActor).mockResolvedValue(actor);
    expect((await DELETE(request(), context)).status).toBe(403);
  }
  expect(deleteInspection).not.toHaveBeenCalled();
});
it("rejects cross-origin and forged deletion data", async () => {
  expect((await DELETE(request(input, "https://other.invalid"), context)).status).toBe(403);
  for (const extra of [{ recordId: "wrong" }, { expectedUpdatedAt: null }, { expectedUpdatedAt: undefined }, { inspectorId: "other" }]) expect((await DELETE(request({ ...input, ...extra }), context)).status).toBe(400);
  expect(deleteInspection).not.toHaveBeenCalled();
});
it("deletes the selected inspection for the verified owner without caching", async () => {
  const response = await DELETE(request(), context);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(deleteInspection).toHaveBeenCalledWith(owner, "inspection", input);
});
