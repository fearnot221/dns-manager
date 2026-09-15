import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: { user: { findUnique: vi.fn() } } }));
import { db } from "@/lib/db/client";
vi.mock("@/lib/users/demo", () => ({ demoUsers: vi.fn() }));
import { auth } from "@/lib/auth/config";
import { demoUsers, type DemoUser } from "@/lib/users/demo";
import { requireActor } from "@/lib/auth/session";
let user: DemoUser;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", "");
  user = { id: "dev-test", email: "test@example.com", name: "Test", globalRole: "USER", disabled: false, passwordHash: null, createdAt: new Date().toISOString() };
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue({ loginProvider: "credentials", user: { id: user.id, email: user.email, globalRole: "SUPER_ADMIN" }, expires: "2099-01-01" });
  vi.mocked(demoUsers).mockImplementation(async (operation) => operation([user]));
});
afterEach(() => vi.unstubAllEnvs());
it("uses current stored roles instead of stale session privileges", async () => {
  expect((await requireActor()).globalRole).toBe("USER"); user.globalRole = "ADMIN"; expect((await requireActor()).globalRole).toBe("ADMIN");
});
it("rejects existing sessions after account suspension", async () => {
  user.disabled = true; await expect(requireActor()).rejects.toMatchObject({ status: 401 });
});
it("rejects legacy/password sessions in production before querying permissions", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_PASSWORD_LOGIN_ENABLED", "false");
  await expect(requireActor()).rejects.toMatchObject({ status: 401 });
});

it("never promotes a new USER merely because its Logto subject matches the owner env", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test/db");
  vi.stubEnv("LOGTO_OWNER_SUB", "owner-subject");
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue({ loginProvider: "logto", user: { id: "independent-user", email: "synthetic@accounts.invalid", globalRole: "SUPER_ADMIN" }, expires: "2099-01-01" });
  vi.mocked(db.user.findUnique).mockResolvedValue({ id: "independent-user", email: "synthetic@accounts.invalid", globalRole: "USER", accounts: [{ provider: "logto", providerAccountId: "owner-subject" }], zonePermissions: [], groupMemberships: [] } as never);
  expect(await requireActor()).toMatchObject({ globalRole: "USER", portalIdentifier: null, zoneRoles: {} });
});

it.each(["USER", "ADMIN", "SUPER_ADMIN"] as const)("grants verified student 115502532 owner access regardless of stored %s role or internal IDs", async (globalRole) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test/db");
  const id = "new-independent-account";
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue({ loginProvider: "logto", user: { id, email: "new@accounts.invalid", globalRole: "USER" }, expires: "2099-01-01" });
  vi.mocked(db.user.findUnique).mockResolvedValue({ id, email: "new@accounts.invalid", globalRole, logtoName: "115502532", name: "顯示姓名", accounts: [{ provider: "logto", providerAccountId: "different-sub" }], zonePermissions: [], groupMemberships: [] } as never);
  expect(await requireActor()).toMatchObject({ id, globalRole: "SUPER_ADMIN", portalIdentifier: "115502532" });
});

it("does not grant remembered Logto-name privileges to a password session", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test/db");
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue({ loginProvider: "credentials", user: { id: "same-record", email: "owner-bootstrap@accounts.invalid", globalRole: "SUPER_ADMIN" }, expires: "2099-01-01" });
  vi.mocked(db.user.findUnique).mockResolvedValue({ id: "same-record", email: "owner-bootstrap@accounts.invalid", globalRole: "USER", logtoName: "115502532", accounts: [{ provider: "logto", providerAccountId: "irrelevant-sub" }], zonePermissions: [], groupMemberships: [] } as never);
  expect(await requireActor()).toMatchObject({ globalRole: "USER", portalIdentifier: null });
});
