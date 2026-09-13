import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn() } }));
vi.mock("@/lib/requests/zone-access", () => ({ setZoneApplicationAccess: vi.fn() }));
import { requireActor } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/service";
import { powerdns } from "@/lib/powerdns/client";
import { setZoneApplicationAccess } from "@/lib/requests/zone-access";
import { PATCH } from "@/app/api/zones/[zone]/applications/route";
const call = (body: unknown = { enabled: true, expectedUpdatedAt: null }, origin = "http://localhost:3000") => PATCH(new Request("http://localhost:3000/api/zones/example.com/applications", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ zone: "example.com" }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.mocked(setZoneApplicationAccess).mockResolvedValue({ before: { enabled: false, updatedAt: null, updatedBy: null }, after: { enabled: true, updatedAt: new Date().toISOString(), updatedBy: "admin@example.com" } });
});
it("allows admins and audits the exact before/after state", async () => {
  expect((await call()).status).toBe(200);
  expect(setZoneApplicationAccess).toHaveBeenCalledWith("example.com.", true, null, "admin@example.com");
  expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE_ZONE_APPLICATION_ACCESS", before: expect.objectContaining({ enabled: false }), after: expect.objectContaining({ enabled: true }) }));
});
it("denies users and record editors", async () => {
  for (const zoneRoles of [{}, { "example.com.": "EDITOR" }] as Record<string, "EDITOR">[]) {
    vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles });
    expect((await call()).status).toBe(404);
  }
  expect(setZoneApplicationAccess).not.toHaveBeenCalled();
});
it("limits zone admins to their assigned domain", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: { "other.test.": "ADMIN" } });
  expect((await call()).status).toBe(404);
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
  expect((await call()).status).toBe(200);
});
it("rejects cross-origin, malformed data and missing live zones", async () => {
  expect((await call(undefined, "https://evil.example")).status).toBe(403);
  expect((await call({ enabled: "true" })).status).toBe(400);
  vi.mocked(powerdns.getZone).mockRejectedValueOnce(new Error("Zone missing"));
  expect((await call()).status).toBe(500);
  expect(setZoneApplicationAccess).not.toHaveBeenCalled();
});
