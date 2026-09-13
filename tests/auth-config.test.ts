import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
const mocks = vi.hoisted(() => ({
  nextAuth: vi.fn(() => ({ handlers: {}, auth: vi.fn() })),
  after: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  accountFind: vi.fn(),
  accountCreate: vi.fn(),
}));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/idle-session", () => ({ createIdleSession: vi.fn(async () => Date.now() + 900000), readIdleSession: vi.fn(async () => Date.now() + 900000), revokeIdleSession: vi.fn(async () => undefined) }));
vi.mock("next-auth", () => ({ default: mocks.nextAuth }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: { user: { findUnique: mocks.findUnique, update: mocks.update }, account: { findUnique: mocks.accountFind, create: mocks.accountCreate } } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
async function configuration(production = true, configured = true) {
  vi.stubEnv("NODE_ENV", production ? "production" : "development");
  vi.stubEnv("DATABASE_URL", production ? "postgresql://test/db" : "");
  vi.stubEnv("NCU_PORTAL_CLIENT_ID", configured ? "test-client" : "");
  vi.stubEnv("NCU_PORTAL_CLIENT_SECRET", configured ? "test-secret" : "");
  vi.stubEnv("NCU_OWNER_IDENTIFIER", "owner-test");
  vi.stubEnv("AUTH_PASSWORD_LOGIN_ENABLED", "true");
  vi.stubEnv("GOOGLE_CLIENT_ID", "old-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "old-google-secret");
  await import("@/lib/auth/config");
  // Capture the actual Auth.js configuration without performing network sign-in.
  return (mocks.nextAuth.mock.calls as unknown as [import("next-auth").NextAuthConfig][])[0][0];
}
it("registers Portal and password login for testing", async () => {
  const config = await configuration();
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["credentials", "ncu-portal"]);
  vi.resetModules(); vi.clearAllMocks();
  expect((await configuration(true, false)).providers).toHaveLength(1);
});
it("registers only credentials in local demo", async () => {
  const config = await configuration(false);
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["credentials"]);
});
it("authenticates a database password user without granting admin and rejects disabled accounts", async () => {
  const config = await configuration();
  const provider = config.providers[0] as unknown as { options: { authorize: (value: unknown) => Promise<unknown> } };
  const password = "test-password-123456";
  const user = { id: "ordinary-user", email: "test@example.com", name: "Test", globalRole: "USER", disabled: false, passwordHash: await hashPassword(password) };
  mocks.findUnique.mockResolvedValue(user);
  expect(await provider.options.authorize({ email: user.email, password })).toMatchObject({ id: user.id, globalRole: "USER" });
  expect(await provider.options.authorize({ email: user.email, password: "incorrect" })).toBeNull();
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
  for (const loginProvider of [undefined, "google"]) {
    expect(await jwt({ token: { loginProvider } } as Parameters<typeof jwt>[0])).toBeNull();
  }
  expect(await jwt({ token: {}, user: { id: "owner", globalRole: "SUPER_ADMIN" }, account: { type: "oauth", providerAccountId: "owner-test", provider: "ncu-portal" }, profile: { identifier: "owner-test" } })).toMatchObject({ loginProvider: "ncu-portal", userId: "owner", globalRole: "SUPER_ADMIN" });
});
it("accepts a new verified Portal user without pre-registration", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue(null);
  const signIn = config.callbacks!.signIn!;
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "ncu-portal", providerAccountId: "student" }, profile: { identifier: "student", email: "student@example.com", emailVerified: true } })).toBe(true);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
it("does not merge an existing administrator account just by matching email", async () => {
  const config = await configuration();
  mocks.accountFind.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue({ id: "admin", globalRole: "ADMIN", disabled: false });
  expect(await config.callbacks!.signIn!({ user: {}, account: { type: "oauth", provider: "ncu-portal", providerAccountId: "someone" }, profile: { identifier: "someone", email: "admin@example.com", emailVerified: true } })).toBe(false);
  expect(mocks.accountCreate).not.toHaveBeenCalled();
});
it("keeps disabled-user checks synchronous and defers only last-login bookkeeping", async () => {
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  mocks.accountFind.mockResolvedValue({ user: { email: "student@example.com", disabled: true, globalRole: "USER" } });
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "ncu-portal", providerAccountId: "student" }, profile: { identifier: "student", email: "student@example.com", emailVerified: true } })).toBe(false);
  await config.events!.signIn!({ user: { id: "test-user", email: "test@example.com" }, isNewUser: false });
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.update.mockResolvedValue({});
  await mocks.after.mock.calls[0][0]();
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "test-user" }, data: { lastLoginAt: expect.any(Date) } });
});
