import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
const mocks = vi.hoisted(() => ({
  nextAuth: vi.fn(() => ({ handlers: {}, auth: vi.fn() })),
  after: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  accountFind: vi.fn(),
  accountCreate: vi.fn(),
}));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/idle-session", () => ({ createIdleSession: vi.fn(async () => Date.now() + 900000), readIdleSession: vi.fn(async () => Date.now() + 900000), revokeIdleSession: vi.fn(async () => undefined) }));
vi.mock("next-auth", () => ({ default: mocks.nextAuth }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: { user: { findUnique: mocks.findUnique, findFirst: mocks.findFirst, update: mocks.update }, account: { findUnique: mocks.accountFind, create: mocks.accountCreate } } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.findFirst.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const identities = (name?: string, username?: string) => ({ ncu: { userId: "portal-user", details: { name, rawData: { username } } } });
async function configuration(production = true, configured = true) {
  vi.stubEnv("NODE_ENV", production ? "production" : "development");
  vi.stubEnv("DATABASE_URL", production ? "postgresql://test/db" : "");
  vi.stubEnv("AUTH_LOGTO_ID", configured ? "test-client" : "");
  vi.stubEnv("AUTH_LOGTO_SECRET", configured ? "test-secret" : "");
  vi.stubEnv("LOGTO_OWNER_SUB", "owner-test");
  vi.stubEnv("AUTH_PASSWORD_LOGIN_ENABLED", "true");
  vi.stubEnv("GOOGLE_CLIENT_ID", "old-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "old-google-secret");
  await import("@/lib/auth/config");
  // Capture the actual Auth.js configuration without performing network sign-in.
  return (mocks.nextAuth.mock.calls as unknown as [import("next-auth").NextAuthConfig][])[0][0];
}
it("registers Portal and password login for testing", async () => {
  const config = await configuration();
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["credentials", "logto"]);
  vi.resetModules(); vi.clearAllMocks();
  expect((await configuration(true, false)).providers).toHaveLength(1);
});
it("registers only credentials in local demo", async () => {
  const config = await configuration(false);
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["credentials"]);
});
it("validates existing test passwords and rejects disabled accounts or a disabled provider", async () => {
  const config = await configuration();
  const provider = config.providers[0] as unknown as { options: { authorize: (value: unknown) => Promise<unknown> } };
  const password = "test-password-123456";
  const user = { id: "test", email: "test@example.invalid", name: "Test", globalRole: "USER", disabled: false, passwordHash: await hashPassword(password) };
  mocks.findUnique.mockResolvedValue(user);
  expect(await provider.options.authorize({ email: user.email, password })).toMatchObject({ id: "test", globalRole: "USER" });
  expect(await provider.options.authorize({ email: user.email, password: "wrong" })).toBeNull();
  mocks.findUnique.mockResolvedValue({ ...user, disabled: true });
  expect(await provider.options.authorize({ email: user.email, password })).toBeNull();
  vi.stubEnv("AUTH_PASSWORD_LOGIN_ENABLED", "false");
  mocks.findUnique.mockClear();
  expect(await provider.options.authorize({ email: user.email, password })).toBeNull();
  expect(mocks.findUnique).not.toHaveBeenCalled();
});
it("rejects old JWTs and preserves Portal provenance on new JWTs", async () => {
  const config = await configuration();
  const jwt = config.callbacks!.jwt!;
  for (const loginProvider of [undefined, "google", "ncu-portal"]) {
    expect(await jwt({ token: { loginProvider } } as Parameters<typeof jwt>[0])).toBeNull();
  }
  expect(await jwt({ token: {}, user: { id: "owner", globalRole: "SUPER_ADMIN" }, account: { type: "oauth", providerAccountId: "owner-test", provider: "logto" }, profile: { sub: "owner-test", identities: identities("115502532") } })).toMatchObject({ loginProvider: "logto", userId: "owner", globalRole: "SUPER_ADMIN" });
});
it("allows the owner subject as an independent USER but preserves explicit owner linking", async () => {
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  mocks.accountFind.mockResolvedValue(null);
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test", email: "owner@example.invalid", email_verified: true } })).toBe(true);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "one" }, profile: { sub: "another" } })).toBe(false);
  mocks.accountFind.mockResolvedValue({ user: { id: "ordinary", email: "u@example.com", accounts: [], globalRole: "USER", disabled: false } });
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test" } })).toBe(true);
  mocks.accountFind.mockResolvedValue({ user: { id: "owner", email: "owner@example.invalid", accounts: [{ provider: "ncu-portal", providerAccountId: "115502532" }], globalRole: "SUPER_ADMIN", disabled: false } });
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test", identities: identities("115502532", "管理者姓名") } })).toBe(true);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "owner" }, data: { name: "管理者姓名", portalEmail: null, logtoName: "115502532", studentId: "115502532" } });
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "wrong-sub" }, profile: { sub: "wrong-sub" } })).toBe(false);
});
it("keeps the Logto ID token out of the public session", async () => {
  const config = await configuration();
  const session = config.callbacks!.session!;
  const result = await session({ session: { user: { id: "u", email: "u@example.com" }, expires: "2099-01-01" }, token: { userId: "u", loginProvider: "logto", logtoIdToken: "private-id-token", globalRole: "USER" } } as Parameters<typeof session>[0]);
  expect(JSON.stringify(result)).not.toContain("private-id-token");
});

it("gives a newly provisioned Portal identity the effective owner JWT role, not an embedded role", async () => {
  const config = await configuration();
  const jwt = config.callbacks!.jwt!;
  const base = { token: {}, user: { id: "new-user", globalRole: "USER" as const }, account: { type: "oidc" as const, provider: "logto", providerAccountId: "new-sub" } };
  expect(await jwt({ ...base, profile: { sub: "new-sub", identities: identities("115502532") } })).toMatchObject({ globalRole: "SUPER_ADMIN" });
  expect(await jwt({ ...base, token: {}, profile: { sub: "new-sub", identities: { ncu: { userId: "portal-user", details: { name: "other-student", role: "SUPER_ADMIN", rawData: { username: "115502532" } } } } } })).toMatchObject({ globalRole: "USER" });
});
it("accepts a new verified Portal user without pre-registration", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue(null);
  const signIn = config.callbacks!.signIn!;
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "student" }, profile: { sub: "student", email: "student@example.com", email_verified: true } })).toBe(true);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
it("refreshes Portal identity details without trusting unrequested top-level email", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue({ user: { id: "linked", disabled: false, globalRole: "USER", accounts: [] } });
  const signIn = config.callbacks!.signIn!;
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "account" }, profile: { sub: "account", identities: identities("111504515", "王小明"), email: "display@example.com", email_verified: true } })).toBe(true);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "linked" }, data: { logtoName: "111504515", portalEmail: null, name: "王小明", studentId: "111504515" } });
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "account" }, profile: { sub: "account" } })).toBe(true);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "linked" }, data: { logtoName: null, portalEmail: null, name: "未提供姓名" } });
});

it("synchronizes identity names and student IDs without granting roles or rewriting login email", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue({ user: { id: "linked", name: "舊姓名", disabled: false, globalRole: "USER", accounts: [] } });
  const user: { name?: string } = {};
  expect(await config.callbacks!.signIn!({ user, account: { type: "oidc", provider: "logto", providerAccountId: "ordinary" }, profile: { sub: "ordinary", identities: identities("115502532", "王小明") } })).toBe(true);
  expect(user.name).toBe("王小明");
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "linked" }, data: { logtoName: "115502532", portalEmail: null, name: "王小明", studentId: "115502532" } });
  expect(await config.callbacks!.signIn!({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "ordinary" }, profile: { sub: "ordinary" } })).toBe(true);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "linked" }, data: { logtoName: null, portalEmail: null, name: "舊姓名" } });
});

it("persists identities details username for existing users and ignores embedded roles", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue({ user: { id: "linked", name: "原姓名", disabled: false, globalRole: "USER", accounts: [] } });
  const user: { name?: string } = {};
  expect(await config.callbacks!.signIn!({ user, account: { type: "oidc", provider: "logto", providerAccountId: "ordinary" }, profile: { sub: "ordinary", identities: { ncu: { userId: "portal-user", details: { name: "115502532", role: "SUPER_ADMIN", rawData: { username: " 王小明 " } } } } } })).toBe(true);
  expect(user.name).toBe("王小明");
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "linked" }, data: { logtoName: "115502532", portalEmail: null, name: "王小明", studentId: "115502532" } });
});

it("authorizes the owner by verified identities details name, never sub or display claims", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue({ user: { id: "owner", logtoName: "115502532", globalRole: "SUPER_ADMIN", accounts: [], disabled: false } });
  const attempt = (profile: object) => config.callbacks!.signIn!({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "any-logto-sub" }, profile: { sub: "any-logto-sub", ...profile } });
  expect(await attempt({ identities: identities("115502532", "管理者") })).toBe(true);
  expect(await attempt({ identities: identities("111504515", "115502532") })).toBe(false);
  expect(await attempt({ name: "115502532", custom_data: { username: "管理者" } })).toBe(false);
  mocks.accountFind.mockResolvedValue({ user: { id: "admin", logtoName: "111504515", globalRole: "ADMIN", accounts: [], disabled: false } });
  expect(await attempt({ identities: identities("different-student") })).toBe(false);
  expect(await attempt({})).toBe(false);
  expect(await attempt({ identities: identities("111504515") })).toBe(true);
});
it("ignores matching real email and only rejects a synthetic identity collision", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findFirst.mockResolvedValue({ id: "admin", globalRole: "ADMIN", disabled: false });
  expect(await config.callbacks!.signIn!({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "someone" }, profile: { sub: "someone", email: "admin@example.com", email_verified: true } })).toBe(false);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
  expect(mocks.findFirst).toHaveBeenCalledWith({ where: { email: expect.stringMatching(/^logto-[a-f0-9]+@accounts.invalid$/) } });
  mocks.findFirst.mockResolvedValue(null);
  expect(await config.callbacks!.signIn!({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "someone" }, profile: { sub: "someone", email: "admin@example.com", email_verified: true } })).toBe(true);
});
it("keeps disabled-user checks synchronous and defers only last-login bookkeeping", async () => {
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  mocks.accountFind.mockResolvedValue({ user: { email: "student@example.com", disabled: true, globalRole: "USER" } });
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "student" }, profile: { sub: "student", email: "student@example.com", email_verified: true } })).toBe(false);
  await config.events!.signIn!({ user: { id: "test-user", email: "test@example.com" }, isNewUser: false });
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.update.mockResolvedValue({});
  await mocks.after.mock.calls[0][0]();
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "test-user" }, data: { lastLoginAt: expect.any(Date) } });
});

it("reports safe denial reasons without leaking identity or database errors", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  const attempt = (sub = "owner-test") => signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: sub }, profile: { sub, email: "private@example.com", email_verified: true } });
  mocks.accountFind.mockResolvedValue(null);
  expect(await attempt()).toBe(true);
  mocks.findFirst.mockResolvedValue({ id: "existing" });
  expect(await attempt("ordinary")).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"account_link_required"'));
  mocks.accountFind.mockRejectedValueOnce(new Error("private database password"));
  expect(await attempt()).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"account_lookup_failed"'));
  expect(await attempt("")).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"invalid_profile"'));
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|owner-test|ordinary/);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
