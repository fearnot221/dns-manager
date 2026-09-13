import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  nextAuth: vi.fn(() => ({ handlers: {}, auth: vi.fn() })),
  after: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  accountFind: vi.fn(),
  accountCreate: vi.fn(),
}));
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
  vi.stubEnv("GOOGLE_CLIENT_ID", "old-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "old-google-secret");
  await import("@/lib/auth/config");
  // Capture the actual Auth.js configuration without performing network sign-in.
  return (mocks.nextAuth.mock.calls as unknown as [import("next-auth").NextAuthConfig][])[0][0];
}
it("registers only Portal in production, and no fallback when unconfigured", async () => {
  const config = await configuration();
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["ncu-portal"]);
  vi.resetModules(); vi.clearAllMocks();
  expect((await configuration(true, false)).providers).toEqual([]);
});
it("registers only credentials in local demo", async () => {
  const config = await configuration(false);
  expect(config.providers.map((p) => typeof p === "function" ? p().id : p.id)).toEqual(["credentials"]);
});
it("rejects old JWTs and preserves Portal provenance on new JWTs", async () => {
  const config = await configuration();
  const jwt = config.callbacks!.jwt!;
  for (const loginProvider of [undefined, "credentials", "google"]) {
    expect(await jwt({ token: { loginProvider } } as Parameters<typeof jwt>[0])).toBeNull();
  }
  expect(await jwt({ token: {}, user: { id: "owner", globalRole: "SUPER_ADMIN" }, account: { provider: "ncu-portal" } } as Parameters<typeof jwt>[0])).toMatchObject({ loginProvider: "ncu-portal", userId: "owner", globalRole: "SUPER_ADMIN" });
});
it("keeps disabled-user checks synchronous and defers only last-login bookkeeping", async () => {
  const config = await configuration();
  const signIn = config.callbacks!.signIn!;
  mocks.accountFind.mockResolvedValue({ user: { email: "student@example.com", disabled: true, globalRole: "USER" } });
  expect(await signIn({ user: {}, account: { type: "oauth", provider: "ncu-portal", providerAccountId: "student" }, profile: { identifier: "student", email: "student@example.com", emailVerified: true } })).toBe(false);
  await config.events!.signIn!({ user: { id: "test-user" }, isNewUser: false });
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.update.mockResolvedValue({});
  await mocks.after.mock.calls[0][0]();
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "test-user" }, data: { lastLoginAt: expect.any(Date) } });
});
