import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(async () => ({ id: "owner", email: "fearnot@ce.ncu.edu.tw", globalRole: "SUPER_ADMIN", zoneRoles: {} })), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { createZone: vi.fn() } }));
import { POST } from "@/app/api/zones/route";
import { powerdns } from "@/lib/powerdns/client";
it("rejects zone creation even for the protected owner", async () => {
  const response = await POST(new Request("http://localhost/api/zones", { method: "POST", body: JSON.stringify({ name: "example.test" }) }));
  expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("GET");
  expect(powerdns.createZone).not.toHaveBeenCalled();
});
