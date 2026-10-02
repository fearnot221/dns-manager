import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/units/unit-workspace", () => ({ useUnitWorkspace: () => ({ active: { id: "lab", name: "實驗室", role: "ADMIN" } }) }));
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { useResource } from "@/lib/client/use-resource";
import { UnitsWorkbench } from "@/components/units/units-workbench";

it.each(["EDITOR", "ADMIN"])("shows allowlist management only to unit admins: %s", (role) => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role, memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", status: "APPROVED" }, role, canApply: false, systemAdmin: false, members: [], records: [], recordsError: "", allowlist: [{ studentId: "115000001", userId: null }] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: false }));
  expect(html).not.toContain("修改單位名稱"); expect(html).not.toContain("刪除單位");
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

it("shows system admins the selected unit users and DNS without application actions", () => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role: "ADMIN", memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", status: "APPROVED" }, role: "ADMIN", canApply: true, systemAdmin: true, members: [{ userId: "u", label: "單位成員", studentId: "123", role: "EDITOR", disabled: false }], records: [{ id: "dns", recordName: "lab.example.com.", recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "研究" }], recordsError: "", allowlist: [] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: true }));
  expect(html).toContain("修改單位名稱"); expect(html).toContain("刪除單位");
  expect(html).toContain('disabled="" title="請先移除所有成員後再刪除單位"');
  expect(html).toContain("單位成員"); expect(html).toContain("lab.example.com."); expect(html).toContain("192.0.2.1");
  expect(html).toContain("搜尋 DNS"); expect(html).toContain("管理權限");
  expect(html).not.toContain('href="/requests/new"'); expect(html).not.toContain("申請變更</button>");
});


it.each([false, true])("offers inspections to unit members and deletion only to editors (canApply: %s)", (canApply) => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role: canApply ? "EDITOR" : "EDITOR", memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", status: "APPROVED" }, role: canApply ? "EDITOR" : "EDITOR", canApply, systemAdmin: false, members: [], records: [{ id: "dns", recordName: "lab.example.com.", recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "研究" }], recordsError: "", allowlist: [] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: false, mode: "dns" }));
  expect(html).toContain("清查</button>");
  expect(html.includes("申請刪除</button>")).toBe(canApply);
  expect(html.includes("申請變更</button>")).toBe(canApply);
});

it("never offers approval or rejection for legacy inactive units", () => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "PENDING", role: "ADMIN", memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", status: "PENDING" }, role: "ADMIN", canApply: false, systemAdmin: true, members: [], records: [], recordsError: "", allowlist: [] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: true }));
  expect(html).toContain("建立單位"); expect(html).toContain("未啟用");
  expect(html).not.toContain("核准單位"); expect(html).not.toContain("退回單位"); expect(html).not.toContain("待系統管理員審核");
});
