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
  expect(await jwt({ token: {}, user: { id: "owner", globalRole: "SUPER_ADMIN" }, account: { type: "oauth", providerAccountId: "owner-test", provider: "logto" }, profile: { sub: "owner-test" } })).toMatchObject({ loginProvider: "logto", userId: "owner", globalRole: "SUPER_ADMIN" });
});
it("requires explicit owner linking and rejects subject mismatches", async () => {
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  mocks.accountFind.mockResolvedValue(null);
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test", email: "fearnot@ce.ncu.edu.tw", email_verified: true } })).toBe(false);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "one" }, profile: { sub: "another" } })).toBe(false);
  mocks.accountFind.mockResolvedValue({ user: { id: "ordinary", email: "u@example.com", accounts: [], globalRole: "USER", disabled: false } });
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test" } })).toBe(false);
  mocks.accountFind.mockResolvedValue({ user: { id: "owner", email: "fearnot@ce.ncu.edu.tw", accounts: [{ provider: "ncu-portal", providerAccountId: "115502532" }], globalRole: "SUPER_ADMIN", disabled: false } });
  expect(await signIn({ user: {}, account: { type: "oidc", provider: "logto", providerAccountId: "owner-test" }, profile: { sub: "owner-test", name: "管理者姓名" } })).toBe(true);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "owner" }, data: { name: "管理者姓名", portalEmail: null } });
});
it("keeps the Logto ID token out of the public session", async () => {
  const config = await configuration();
  const session = config.callbacks!.session!;
  const result = await session({ session: { user: { id: "u", email: "u@example.com" }, expires: "2099-01-01" }, token: { userId: "u", loginProvider: "logto", logtoIdToken: "private-id-token", globalRole: "USER" } } as Parameters<typeof session>[0]);
  expect(JSON.stringify(result)).not.toContain("private-id-token");
});
it("accepts a new verified Portal user without pre-registration", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue(null);
  const signIn = config.callbacks!.signIn!;
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "student" }, profile: { sub: "student", email: "student@example.com", email_verified: true } })).toBe(true);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
it("refreshes Portal display email and account name without changing the login email or roles", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue({ user: { id: "linked", disabled: false, globalRole: "USER", accounts: [] } });
  const signIn = config.callbacks!.signIn!;
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "account" }, profile: { sub: "account", name: "王小明", email: "display@example.com", email_verified: true } })).toBe(true);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "linked" }, data: { portalEmail: "display@example.com", name: "王小明" } });
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "account" }, profile: { sub: "account" } })).toBe(true);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "linked" }, data: { portalEmail: null, name: "未提供姓名" } });
});
it("does not merge an existing administrator account just by matching email", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findFirst.mockResolvedValue({ id: "admin", globalRole: "ADMIN", disabled: false });
  expect(await config.callbacks!.signIn!({ user: {}, account: { type: "oauth", provider: "logto", providerAccountId: "someone" }, profile: { sub: "someone", email: "admin@example.com", email_verified: true } })).toBe(false);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
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
  expect(await attempt()).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"owner_link_required"'));
  mocks.findFirst.mockResolvedValue({ id: "existing" });
  expect(await attempt("ordinary")).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"account_link_required"'));
  mocks.accountFind.mockRejectedValueOnce(new Error("private database password"));
  expect(await attempt()).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"account_lookup_failed"'));
  expect(await attempt("")).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"invalid_profile"'));
  vi.stubEnv("LOGTO_OWNER_SUB", "");
  expect(await attempt()).toBe(false);
  expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"owner_not_configured"'));
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|owner-test|ordinary/);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
