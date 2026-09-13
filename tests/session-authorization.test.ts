import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
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
  await expect(requireActor()).rejects.toMatchObject({ status: 401 });
});
