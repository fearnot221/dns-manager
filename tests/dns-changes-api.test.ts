import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/dns-changes/service", () => ({ listDnsChanges: vi.fn(), restoreDnsChange: vi.fn() }));
import { requireActor, AuthError } from "@/lib/auth/session";
import { listDnsChanges, restoreDnsChange } from "@/lib/dns-changes/service";
import { GET } from "@/app/api/dns-changes/route";
import { POST } from "@/app/api/dns-changes/[id]/restore/route";
const context = { params: Promise.resolve({ id: "event" }) };
const request = (origin = "http://localhost") => new Request("http://localhost/api/dns-changes/event/restore", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ zone: "forged.example.", before: "forged" }) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "a@example.com", globalRole: "ADMIN", zoneRoles: {} }); });
it("enforces authentication and same origin before restore", async () => {
  expect((await POST(request("https://evil.invalid"), context)).status).toBe(403);
  vi.mocked(requireActor).mockRejectedValue(new AuthError());
  expect((await POST(request(), context)).status).toBe(401);
  expect((await GET(new Request("http://localhost/api/dns-changes"))).status).toBe(401);
  expect(restoreDnsChange).not.toHaveBeenCalled(); expect(listDnsChanges).not.toHaveBeenCalled();
});
it("passes only the persisted event identity and validates pagination", async () => {
  vi.mocked(restoreDnsChange).mockResolvedValue({ restored: true });
  expect((await POST(request(), context)).status).toBe(200);
  expect(restoreDnsChange).toHaveBeenCalledWith(expect.objectContaining({ id: "admin" }), "event");
  vi.mocked(listDnsChanges).mockResolvedValue({ page: 1, events: [], total: 0 });
  const response = await GET(new Request("http://localhost/api/dns-changes"));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  for (const page of ["0", "-1", "10001", "abc"]) expect((await GET(new Request(`http://localhost/api/dns-changes?page=${page}`))).status).toBe(400);
});
