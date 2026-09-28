import { describe, expect, it } from "vitest";
import { isNavActive, workspaceNavigation } from "@/lib/client/navigation";

describe("workspace navigation", () => {
  const items = (admin: boolean, systemAdmin: boolean) => workspaceNavigation(admin, systemAdmin).flatMap((group) => group.items);
  it("keeps personal workflows available without exposing management links", () => {
    expect(items(false, false).map((item) => item.href)).toEqual(["/requests/new", "/requests", "/units"]);
    expect(items(false, false).find((item) => item.href === "/requests")?.label).toBe("我的 DNS");
  });
  it("separates zone management from global administration", () => {
    expect(items(true, false).map((item) => item.href)).toContain("/zones");
    expect(items(true, false).map((item) => item.href)).toContain("/admin/application-policy");
    expect(items(true, false).map((item) => item.href)).toContain("/inventory");
    expect(items(true, false).filter((item) => item.href.startsWith("/admin")).map((item) => item.href)).toEqual(["/admin/application-policy"]);
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
  it("removes messaging and inspection notification links for every role", () => {
    for (const [admin, systemAdmin] of [[false, false], [true, false], [true, true]]) {
      const navigation = workspaceNavigation(admin, systemAdmin);
      expect(navigation.some((group) => group.id === "collaboration")).toBe(false);
      expect(items(admin, systemAdmin).map((item) => item.href)).not.toContain("/contact");
      expect(items(admin, systemAdmin).map((item) => item.href)).not.toContain("/inspections");
    }
  });
});
