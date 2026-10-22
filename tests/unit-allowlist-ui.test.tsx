import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/units/unit-workspace", () => ({ useUnitWorkspace: () => ({ active: { id: "lab", name: "實驗室", role: "ADMIN" } }) }));
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { useResource } from "@/lib/client/use-resource";
import { UnitsWorkbench, UnitProfileFields } from "@/components/units/units-workbench";

it.each(["EDITOR", "ADMIN"])("shows allowlist management only to unit admins: %s", (role) => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role, memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", note: "研究單位備註", location: "E1-213", extension: "01234", advisor: "王老師", status: "APPROVED" }, role, canApply: false, systemAdmin: false, members: [], records: [], recordsError: "", allowlist: [{ studentId: "115000001", userId: null }] } }) as never);
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
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role: "ADMIN", memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", note: "研究單位備註", location: "E1-213", extension: "01234", advisor: "王老師", status: "APPROVED" }, role: "ADMIN", canApply: true, systemAdmin: true, members: [{ userId: "u", label: "單位成員", studentId: "123", role: "EDITOR", disabled: false }], records: [{ id: "dns", recordName: "lab.example.com.", recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "研究" }], recordsError: "", allowlist: [] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: true }));
  expect(html).toContain("研究單位備註");
  for (const value of ["單位資訊", "E1-213", "01234", "王老師", "編輯單位資訊"]) expect(html).toContain(value);
  expect(html).not.toContain("修改單位名稱"); expect(html).not.toContain("設定系所組別"); expect(html).toContain("刪除單位");
  expect(html).toMatch(/<button class="button danger" disabled="" aria-describedby="unit-delete-help-lab">刪除單位<\/button>/);
  expect(html).toContain('id="unit-delete-help-lab"'); expect(html).toContain("需先移出所有成員");
  expect(html).toContain("單位成員"); expect(html).toContain("lab.example.com."); expect(html).toContain("192.0.2.1");
  expect(html).toContain("搜尋 DNS"); expect(html).toContain("管理權限");
  expect(html).not.toContain('href="/requests/new"'); expect(html).not.toContain("申請變更</button>");
});


it.each([false, true])("offers inspections to unit members and deletion only to editors (canApply: %s)", (canApply) => {
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [{ id: "lab", name: "實驗室", status: "APPROVED", role: canApply ? "EDITOR" : "EDITOR", memberCount: 1 }] } : { unit: { id: "lab", name: "實驗室", note: "研究單位備註", location: "E1-213", extension: "01234", advisor: "王老師", status: "APPROVED" }, role: canApply ? "EDITOR" : "EDITOR", canApply, systemAdmin: false, members: [], records: [{ id: "dns", recordName: "lab.example.com.", recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "研究" }], recordsError: "", allowlist: [] } }) as never);
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

it("groups the unit selector by 系所 then 組別 in policy order, unassigned last", () => {
  const unit = (id: string, name: string, department: string | null) => ({ id, name, department, status: "APPROVED", role: "ADMIN", memberCount: 0 });
  vi.mocked(useResource).mockImplementation((url) => ({ loading: false, error: "", reload: vi.fn(), data: url === "/api/units" ? { units: [unit("a", "未分組單位", null), unit("b", "電子實驗室", "電機系／電子組"), unit("c", "資通實驗室", "通訊系／資通組"), unit("d", "電通實驗室", "通訊系／電通組")] } : { unit: { id: "a", name: "未分組單位", status: "APPROVED" }, role: "ADMIN", canApply: false, systemAdmin: true, members: [], records: [], recordsError: "", allowlist: [] } }) as never);
  const html = renderToStaticMarkup(createElement(UnitsWorkbench, { systemAdmin: true }));
  const nav = html.slice(html.indexOf('aria-label="選擇管理單位"'), html.indexOf("</nav>"));
  const order = ["<h3>通訊系</h3>", "資通組", "資通實驗室", "電通組", "電通實驗室", "<h3>電機系</h3>", "電子組", "電子實驗室", "<h3>未設定系所</h3>", "未分組單位"].map((text) => nav.indexOf(text));
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(nav).toContain('aria-label="搜尋單位"'); expect(nav).toContain('aria-label="篩選系所"');
});

it.each([false, true])("combines identity fields with required location and extension (system admin: %s)", (systemAdmin) => {
  const html = renderToStaticMarkup(createElement(UnitProfileFields, { systemAdmin, unit: { name: "實驗室", department: "電機系／系辦", location: "E1-213", extension: "01234", advisor: "王老師" } }));
  expect(html).toContain("單位名稱"); expect(html).toContain("所屬系所／組別");
  expect(html.includes('name="name"')).toBe(systemAdmin);
  expect(html.includes('name="department"')).toBe(systemAdmin);
  for (const name of ["location", "extension"]) expect(html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0]).toContain('required=""');
  expect(html).not.toContain("單位位置（選填）"); expect(html).not.toContain("單位分機（選填）");
});
