import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/inventory/assignment", () => ({ assignRecordUnit: vi.fn() }));
import { requireActor } from "@/lib/auth/session";
import { assignRecordUnit } from "@/lib/inventory/assignment";
import { PUT } from "@/app/api/inventory/assignment/route";
const input = { id: "a".repeat(64), zoneName: "example.com.", recordName: "lab.example.com.", recordType: "A", content: "192.0.2.1", expectedUpdatedAt: null, unitId: "lab" };
const request = (body: unknown = input, origin = "http://localhost") => new Request("http://localhost/api/inventory/assignment", { method: "PUT", headers: { Origin: origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} }); vi.mocked(assignRecordUnit).mockResolvedValue({ success: true }); });
it("rejects cross-origin requests and forged assignment fields", async () => {
  expect((await PUT(request(input, "https://other.invalid"))).status).toBe(403);
  for (const extra of [{ unitId: "" }, { expectedUpdatedAt: undefined }, { userId: "user" }, { inspectedAt: new Date().toISOString() }]) expect((await PUT(request({ ...input, ...extra }))).status).toBe(400);
  expect(assignRecordUnit).not.toHaveBeenCalled();
});
it("does not grant assignment rights to a delegated zone admin", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
  expect((await PUT(request())).status).toBe(403); expect(assignRecordUnit).not.toHaveBeenCalled();
});
it("accepts system administrator unit assignment without caching the response", async () => {
  const response = await PUT(request());
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(assignRecordUnit).toHaveBeenCalledWith(expect.objectContaining({ id: "admin" }), input);
});
