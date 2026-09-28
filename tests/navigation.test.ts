import { describe, expect, it } from "vitest";
import { isNavActive, workspaceNavigation } from "@/lib/client/navigation";

describe("workspace navigation", () => {
  const items = (admin: boolean, systemAdmin: boolean) => workspaceNavigation(admin, systemAdmin).flatMap((group) => group.items);
  it("keeps unit workflows flat without exposing management links", () => {
    expect(items(false, false).map((item) => item.href)).toEqual(["/dns", "/requests/new", "/requests"]);
    expect(items(false, false).find((item) => item.href === "/requests")?.label).toBe("申請紀錄");
  });
  it("only exposes unit management to unit or global administrators", () => {
    expect(workspaceNavigation(false, false, true)[0].items.find((item) => item.href === "/units")?.label).toBe("單位管理");
    expect(items(true, false).some((item) => item.href === "/units")).toBe(false);
    expect(items(true, true).find((item) => item.href === "/units")?.label).toBe("單位管理");
    expect(workspaceNavigation(false, false)).toHaveLength(1);
  });
  it("separates zone management from global administration", () => {
    expect(items(true, false).map((item) => item.href)).toContain("/zones");
    expect(items(true, false).map((item) => item.href)).toContain("/admin/application-policy");
    expect(items(true, false).map((item) => item.href)).not.toContain("/inventory");
    expect(items(true, false).find((item) => item.href === "/zones")?.label).toBe("DNS 管理");
    expect(items(true, false).filter((item) => item.href.startsWith("/admin")).map((item) => item.href)).toEqual(["/admin/application-policy"]);
    expect(items(true, true).map((item) => item.href)).toEqual(expect.arrayContaining(["/admin/users", "/admin/application-policy", "/activity"]));
  });
  it("selects only the relevant route, including zone detail pages", () => {
    const navigation = items(false, false);
    expect(navigation.filter((item) => isNavActive("/requests/new", item)).map((item) => item.href)).toEqual(["/requests/new"]);
    expect(items(true, true).filter((item) => isNavActive("/zones/example.com", item)).map((item) => item.href)).toEqual(["/zones"]);
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

it("removes user DNS workflows from system administrator navigation", () => {
  const routes = workspaceNavigation(true, true, true)[0].items.map((item) => item.href);
  expect(routes).not.toContain("/dns"); expect(routes).not.toContain("/requests/new");
  expect(routes).toContain("/units"); expect(routes).toContain("/requests");
});
