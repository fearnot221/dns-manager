import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true }));
vi.mock("@/lib/users/demo", () => ({ demoUsers: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
import { requireActor } from "@/lib/auth/session";
import { demoUsers, type DemoUser } from "@/lib/users/demo";
import { GET, POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";
import { OWNER_EMAIL, mayManageUser, resolvedGlobalRole } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
const admin: Actor = { id: "dev-admin", email: "admin@aegis.local", globalRole: "ADMIN", zoneRoles: {} };
const owner: Actor = { id: "dev-owner", portalIdentifier: "115502532", email: OWNER_EMAIL, globalRole: "SUPER_ADMIN", zoneRoles: {} };
let users: DemoUser[];
const request = (body: unknown, method = "PATCH") => new Request("http://localhost:3000/api/users", { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue(admin);
  users = [owner, admin, { id: "dev-user", email: "user@example.com", globalRole: "USER" as const }].map((item) => ({ ...item, name: "Test", disabled: false, passwordHash: "never-expose-me", createdAt: new Date().toISOString() }));
  vi.mocked(demoUsers).mockImplementation(async (operation) => operation(users));
});
describe("protected owner and user management", () => {
  it("allows admins and the owner to update or clear owner notes only", async () => {
    for (const actor of [admin, owner]) {
      vi.mocked(requireActor).mockResolvedValue(actor);
      for (const note of ["最高帳號備註", ""]) {
        expect((await PATCH(request({ note }), { params: Promise.resolve({ id: owner.id }) })).status).toBe(200);
        expect(users[0].note).toBe(note);
        expect(users[0].globalRole).toBe("SUPER_ADMIN");
        expect(users[0].disabled).toBe(false);
      }
    }
  });
  it("rejects mixed protected-account updates without writing the note", async () => {
    vi.mocked(requireActor).mockResolvedValue(owner);
    for (const fields of [{ disabled: false }, { disabled: true }, { globalRole: "USER" }]) {
      expect((await PATCH(request({ note: "must not save", ...fields }), { params: Promise.resolve({ id: owner.id }) })).status).toBe(403);
      expect(users[0].note).toBeUndefined();
    }
  });
  it("does not let ordinary users edit owner notes", async () => {
    vi.mocked(requireActor).mockResolvedValue({ id: "dev-user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
    expect((await PATCH(request({ note: "forbidden" }), { params: Promise.resolve({ id: owner.id }) })).status).toBe(403);
    expect(users[0].note).toBeUndefined();
  });
  it("stores notes, displays login email, hides nickname and rejects identity edits", async () => {
    const result = await PATCH(request({ note: "網管測試帳號" }), { params: Promise.resolve({ id: "dev-user" }) });
    expect(result.status).toBe(200);
    expect(users[2].note).toBe("網管測試帳號");
    const body = await result.json();
    expect(body.user.email).toBe("user@example.com");
    expect(body.user).not.toHaveProperty("name");
    expect((await PATCH(request({ studentId: "115502532" }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(400);
    expect((await PATCH(request({ note: "x".repeat(1001) }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(400);
  });
  it("does not expose password hashes", async () => { const response = await GET(); const text = await response.text(); expect(text).not.toContain("passwordHash"); expect(text).not.toContain("never-expose"); });
  it("blocks even the owner from changing the owner account", async () => { vi.mocked(requireActor).mockResolvedValue(owner); expect((await PATCH(request({ disabled: true }), { params: Promise.resolve({ id: owner.id }) })).status).toBe(403); expect(users[0].disabled).toBe(false); });
  it("blocks admins from promoting anyone", async () => { expect((await PATCH(request({ globalRole: "ADMIN" }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(403); });
  it("blocks admins from creating admins", async () => { expect((await POST(request({ email: "other@example.com", name: "Other", password: "Long-test-password!", globalRole: "ADMIN" }, "POST"))).status).toBe(405); });
  it("blocks creation of the reserved owner email", async () => { vi.mocked(requireActor).mockResolvedValue(owner); expect((await POST(request({ email: OWNER_EMAIL.toUpperCase(), name: "Fake owner", password: "Long-test-password!", globalRole: "USER" }, "POST"))).status).toBe(405); });
  it("allows owner promotion and ordinary admin user suspension", async () => { vi.mocked(requireActor).mockResolvedValue(owner); expect((await PATCH(request({ globalRole: "ADMIN" }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(200); expect(users[2].globalRole).toBe("ADMIN"); users[2].globalRole = "USER"; vi.mocked(requireActor).mockResolvedValue(admin); expect((await PATCH(request({ disabled: true }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(200); });
  it("prevents editing admin accounts, unknown fields and cross-origin requests", async () => { expect((await PATCH(request({ note: "Changed" }), { params: Promise.resolve({ id: admin.id }) })).status).toBe(403); expect((await PATCH(request({ email: OWNER_EMAIL }), { params: Promise.resolve({ id: "dev-user" }) })).status).toBe(400); const cross = new Request("http://localhost:3000/api/users", { method: "POST", headers: { Origin: "https://other.example" }, body: "{}" }); expect((await POST(cross)).status).toBe(403); });
  it("does not treat a legacy super admin as the protected owner", () => { expect(resolvedGlobalRole(admin.email, "SUPER_ADMIN")).toBe("ADMIN"); expect(mayManageUser(admin, { email: OWNER_EMAIL, globalRole: "SUPER_ADMIN" })).toBe(false); expect(mayManageUser(admin, { email: "scoped@example.com", globalRole: "USER", zoneAdmin: true })).toBe(false); });
});
