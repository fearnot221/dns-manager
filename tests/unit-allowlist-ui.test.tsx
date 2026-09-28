import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/units/unit-workspace", () => ({ useUnitWorkspace: () => ({ active: { id: "lab", name: "實驗室", role: "ADMIN" } }) }));
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { useResource } from "@/lib/client/use-resource";
import { UnitsWorkbench } from "@/components/units/units-workbench";

it.each(["VIEWER", "EDITOR", "ADMIN"])("shows allowlist management only to unit admins: %s", (role) => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role, memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", status: "APPROVED" }, role, canApply: false, canReview: false, members: [], records: [], recordsError: "", allowlist: [{ studentId: "115000001", userId: null }] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: false }));
  expect(html).not.toContain("白名單"); expect(html).not.toContain("passcode"); expect(html).not.toContain("建立單位");
  expect(html.includes("新增使用者")).toBe(role === "ADMIN");
  expect(html.includes("等待使用者登入")).toBe(role === "ADMIN");
});

it("keeps member management out of the unit DNS view even for a unit admin", () => {
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: false, mode: "dns" }));
  expect(html).not.toContain("學號白名單");
  expect(html).not.toContain("管理權限");
  expect(html).toContain("搜尋 DNS");
  expect(html).not.toContain("選擇管理單位");
});
