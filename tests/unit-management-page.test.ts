import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/units/workspace", () => ({ memberWorkspaces: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { requireActor } from "@/lib/auth/session";
import { memberWorkspaces } from "@/lib/units/workspace";
import UnitsPage from "@/app/(workspace)/units/page";
beforeEach(() => {
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "test@example.com", globalRole: "USER", zoneRoles: {} });
  vi.mocked(memberWorkspaces).mockResolvedValue([]);
});
it("blocks direct management page access without a unit admin membership", async () => {
  await expect(UnitsPage()).rejects.toThrow("redirect:/dns");
  vi.mocked(memberWorkspaces).mockResolvedValue([{ id: "lab", name: "Lab", role: "EDITOR", status: "APPROVED" }]);
  await expect(UnitsPage()).rejects.toThrow("redirect:/dns");
  vi.mocked(requireActor).mockResolvedValue({ id: "zone-admin", email: "test@example.com", globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
  await expect(UnitsPage()).rejects.toThrow("redirect:/dns");
});
it("allows unit managers and global administrators", async () => {
  vi.mocked(memberWorkspaces).mockResolvedValue([{ id: "lab", name: "Lab", role: "ADMIN", status: "APPROVED" }]);
  await expect(UnitsPage()).resolves.toBeTruthy();
  vi.mocked(memberWorkspaces).mockResolvedValue([]);
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "test@example.com", globalRole: "ADMIN", zoneRoles: {} });
  await expect(UnitsPage()).resolves.toBeTruthy();
});

it.each(["ADMIN", "SUPER_ADMIN"] as const)("redirects %s away from user DNS pages", async (globalRole) => {
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "test@example.com", globalRole, zoneRoles: {} });
  const { default: DnsPage } = await import("@/app/(workspace)/dns/page");
  const { default: NewPage } = await import("@/app/(workspace)/requests/new/page");
  await expect(DnsPage()).rejects.toThrow("redirect:/units");
  await expect(NewPage()).rejects.toThrow("redirect:/requests");
});
