import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true, localDocument: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
import { localDocument } from "@/lib/db/local-store";
import { requireActor } from "@/lib/auth/session";
import { portalEmailAllowed, listPortalAllowlist, changePortalAllowlist } from "@/lib/auth/allowlist";
import { GET, POST, DELETE } from "@/app/api/admin/allowlist/route";
import { OWNER_EMAIL } from "@/lib/auth/owner";
beforeEach(() => {
  vi.clearAllMocks();
  const documents: Record<string, unknown> = {};
  let queue: Promise<unknown> = Promise.resolve();
  vi.mocked(localDocument).mockImplementation((name, initial, operation) => {
    const next = queue.then(async () => { documents[name] ??= await initial(); return operation(documents[name]); });
    queue = next.catch(() => undefined); return next;
  });
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
  vi.stubEnv("AUTH_URL", "http://localhost");
});
afterEach(() => vi.unstubAllEnvs());
const request = (email: string, origin = "http://localhost") => new Request("http://localhost/api/admin/allowlist", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email }) });
it("denies unlisted emails and normalizes exact membership", async () => {
  expect(await portalEmailAllowed("student@example.com")).toBe(false);
  expect((await POST(request(" Student@Example.com "))).status).toBe(200);
  expect(await portalEmailAllowed("STUDENT@example.com")).toBe(true);
  expect(await portalEmailAllowed("another@example.com")).toBe(false);
  expect((await DELETE(request("student@example.com"))).status).toBe(200);
  expect(await portalEmailAllowed("student@example.com")).toBe(false);
});
it("protects the built-in owner and denies ordinary users", async () => {
  expect(await portalEmailAllowed(OWNER_EMAIL)).toBe(true);
  expect((await DELETE(request(OWNER_EMAIL))).status).toBe(403);
  await expect(changePortalAllowlist(OWNER_EMAIL, "admin@example.com", true)).rejects.toThrow();
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
  expect((await GET()).status).toBe(403);
  expect((await POST(request("user@example.com"))).status).toBe(403);
  expect((await DELETE(request("student@example.com"))).status).toBe(403);
});
it("blocks CSRF and wildcard/domain entries; preserves independent updates", async () => {
  expect((await POST(request("a@example.com", "https://evil.example"))).status).toBe(403);
  for (const email of ["*@example.com", "example.com", "a@bad"]) expect((await POST(request(email))).status).toBe(400);
  await Promise.all(["a@example.com", "b@example.com"].map((email) => changePortalAllowlist(email, "admin@example.com", false)));
  expect((await listPortalAllowlist()).map((entry) => entry.email)).toEqual([OWNER_EMAIL, "a@example.com", "b@example.com"]);
});
