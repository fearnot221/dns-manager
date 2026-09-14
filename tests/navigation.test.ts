import { describe, expect, it } from "vitest";
import { isNavActive, workspaceNavigation } from "@/lib/client/navigation";

describe("workspace navigation", () => {
  const items = (admin: boolean, systemAdmin: boolean) => workspaceNavigation(admin, systemAdmin).flatMap((group) => group.items);
  it("keeps personal workflows available without exposing management links", () => {
    expect(items(false, false).map((item) => item.href)).toEqual(["/requests/new", "/requests", "/units", "/inspections", "/contact"]);
    expect(items(false, false).find((item) => item.href === "/requests")?.label).toBe("我的 DNS");
  });
  it("separates zone management from global administration", () => {
    expect(items(true, false).map((item) => item.href)).toContain("/zones");
    expect(items(true, false).map((item) => item.href)).toContain("/inventory");
    expect(items(true, false).some((item) => item.href.startsWith("/admin"))).toBe(false);
    expect(items(true, true).map((item) => item.href)).toEqual(expect.arrayContaining(["/admin/users", "/admin/application-policy", "/activity"]));
  });
  it("selects only the relevant route, including zone detail pages", () => {
    const navigation = items(true, true);
    expect(navigation.filter((item) => isNavActive("/requests/new", item)).map((item) => item.href)).toEqual(["/requests/new"]);
    expect(navigation.filter((item) => isNavActive("/zones/example.com", item)).map((item) => item.href)).toEqual(["/zones"]);
    expect(navigation.filter((item) => isNavActive("/zones-other", item))).toEqual([]);
  });
  it("keeps group IDs and routes unique", () => {
    const groups = workspaceNavigation(true, true);
    const routes = items(true, true).map((item) => item.href);
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
    expect(new Set(routes).size).toBe(routes.length);
  });
  it("uses management inbox labels only for system admins", () => {
    expect(items(false, false).find((item) => item.href === "/contact")?.label).toBe("聯絡管理員");
    expect(items(true, false).find((item) => item.href === "/contact")?.label).toBe("聯絡管理員");
    expect(items(true, true).find((item) => item.href === "/contact")?.label).toBe("使用者訊息");
    expect(items(true, true).find((item) => item.href === "/inspections")?.label).toBe("清查回覆管理");
  });
});
