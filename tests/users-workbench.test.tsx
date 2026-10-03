import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { useResource } from "@/lib/client/use-resource";
import { UsersWorkbench } from "@/components/admin/users-workbench";
import { ContactPicker, contactLabel } from "@/components/units/contact-picker";
it("renders accounts under unit headers and collects global admins in their own section", () => {
  const base = { email: "contact@example.com", account: "資料帳號（無登入功能）", note: "", disabled: true, protected: false, zoneAdmin: false, dataOnly: true };
  vi.mocked(useResource).mockReturnValue({ loading: false, error: "", reload: vi.fn(), data: { canAssignAdmin: true, canRemoveUsers: false, users: [{ ...base, id: "contact", name: "聯絡人", globalRole: "USER", units: [{ id: "lab", name: "研究室" }] }, { ...base, id: "admin", name: "Admin", globalRole: "ADMIN", dataOnly: false, units: [{ id: "lab", name: "研究室" }] }] } } as never);
  const html = renderToStaticMarkup(createElement(UsersWorkbench));
  expect(html).toContain("新增資料帳號");
  expect(html).toContain('scope="rowgroup">系統管理員 · 1 個帳號');
  expect(html).toContain('scope="rowgroup">研究室 · 1 個帳號');
  expect(html).toContain("資料帳號</span>");
  expect(html).not.toContain("帳號於 Portal 首次登入後建立");
});
it("offers labeled contact choices without blocking manual input when loading fails", () => {
  vi.mocked(useResource).mockReturnValue({ loading: false, error: "", reload: vi.fn(), data: { contacts: [{ id: "c", name: "聯絡人", email: "c@example.com", units: ["研究室"] }] } } as never);
  const picker = renderToStaticMarkup(createElement(ContactPicker));
  expect(picker).toContain("從資料帳號填入"); expect(picker).toContain('role="combobox"');
  expect(contactLabel({ id: "c", name: "聯絡人", email: "c@example.com", units: ["研究室"] })).toBe("聯絡人 · 研究室 · c@example.com");
  vi.mocked(useResource).mockReturnValue({ error: "offline", loading: false } as never);
  expect(renderToStaticMarkup(createElement(ContactPicker))).toContain("仍可手動填寫聯絡資料");
});
