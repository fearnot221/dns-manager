import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { requireActor, AuthError } from "@/lib/auth/session";
import Dashboard from "@/app/dashboard/page";
beforeEach(() => vi.clearAllMocks());
it("lands ordinary users on unit DNS and administrators on request review", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "test@example.com", globalRole: "USER", zoneRoles: {} });
  await expect(Dashboard()).rejects.toThrow("redirect:/dns");
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "test@example.com", globalRole: "ADMIN", zoneRoles: {} });
  await expect(Dashboard()).rejects.toThrow("redirect:/requests");
});
it("redirects signed-out users to login", async () => {
  vi.mocked(requireActor).mockRejectedValue(new AuthError());
  await expect(Dashboard()).rejects.toThrow("redirect:/login");
});
