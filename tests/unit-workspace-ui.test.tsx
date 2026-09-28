import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/dns", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/lib/auth/logout-action", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/auth/idle-session", () => ({ IdleSession: () => null }));
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { AppShell } from "@/components/app-shell";
import { useResource } from "@/lib/client/use-resource";
import { DnsApplicationForm } from "@/components/requests/dns-application-form";
import { DnsRequestsWorkbench } from "@/components/requests/dns-requests-workbench";
import { UnitWorkspaceProvider, type UnitWorkspace } from "@/components/units/unit-workspace";

const unit: UnitWorkspace = { id: "one", name: "測試單位", status: "APPROVED", role: "EDITOR" };
const shell = (units: UnitWorkspace[], systemAdmin = false) => renderToStaticMarkup(<AppShell units={units} systemAdmin={systemAdmin} admin={systemAdmin} demo={false} identity={{ name: "測試使用者", email: "115000001" }}>內容</AppShell>);
const inWorkspace = (children: React.ReactNode, units = [unit]) => renderToStaticMarkup(<UnitWorkspaceProvider units={units}>{children}</UnitWorkspaceProvider>);
beforeEach(() => vi.clearAllMocks());
it("uses a flat sidebar for zero or one unit and switches only multiple memberships", () => {
  for (const units of [[], [unit]]) {
    const html = shell(units);
    expect(html).not.toContain("工作區"); expect(html).not.toContain("單位管理</span>");
    expect(html).toContain("單位 DNS"); expect(html).toContain("申請紀錄");
    expect(html).not.toContain("我的 DNS"); expect(html).not.toContain("單位與共享 DNS");
  }
  const html = shell([unit, { ...unit, id: "two", name: "第二單位" }]);
  expect(html).toContain("切換工作區"); expect(html).toContain("第二單位");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("data-leave-workspace");
});
it("exposes unit management only for the active unit manager or system admin", () => {
  expect(shell([{ ...unit, role: "ADMIN" }])).toContain("單位管理</span>");
  expect(shell([], true)).toContain("單位管理</span>");
  expect(shell([unit, { ...unit, id: "two", role: "ADMIN" }])).not.toContain("單位管理</span>");
});
it("does not show an application form before unit eligibility is established", () => {
  vi.mocked(useResource).mockReturnValue({ data: { units: [], policy: { allowedTypes: [] } }, loading: false, error: "", reload: vi.fn() } as never);
  const html = inWorkspace(createElement(DnsApplicationForm), []);
  expect(html).toContain("尚未加入單位"); expect(html).not.toContain("送出 1 筆申請");
  expect(html).not.toContain('href="/units"');
});
it("fixes the application to the selected unit instead of silently using another eligible unit", () => {
  vi.mocked(useResource).mockImplementation((url) => ({ data: url === "/api/units" ? { units: [{ ...unit, canApply: true }, { ...unit, id: "two", name: "另一單位", canApply: true }] } : url === "/api/application-policy" ? { policy: { allowedTypes: ["A"], ownership: "UNIT_ONLY" } } : { zones: [{ name: "example.com." }] }, loading: false, error: "", reload: vi.fn() }) as never);
  const html = inWorkspace(createElement(DnsApplicationForm));
  expect(html).toContain("本次申請歸屬「測試單位」"); expect(html).not.toContain("另一單位");
  const other = inWorkspace(createElement(DnsApplicationForm), [{ ...unit, id: "not-eligible" }]);
  expect(other).toContain("此單位目前無法申請"); expect(other).not.toContain("送出 1 筆申請");
});
it("limits ordinary request history to the active unit, preserving admin review scope", () => {
  const request = { id: "r", user: { id: "me", name: "測試", email: null }, recordType: "A", content: "192.0.2.1", zoneName: "example.com.", status: "PENDING", createdAt: "2026-09-29T00:00:00Z", canReview: false };
  vi.mocked(useResource).mockReturnValue({ data: { requests: [{ ...request, unitId: "one", recordName: "active.example.com." }, { ...request, id: "r2", unitId: "two", recordName: "other.example.com." }, { ...request, id: "r3", unitId: null, recordName: "personal.example.com." }] }, loading: false, error: "", reload: vi.fn() } as never);
  const html = inWorkspace(createElement(DnsRequestsWorkbench, { admin: false, actorId: "me" }));
  expect(html).toContain("active.example.com."); expect(html).not.toContain("other.example.com."); expect(html).not.toContain("personal.example.com.");
  const admin = inWorkspace(createElement(DnsRequestsWorkbench, { admin: true, actorId: "me" }));
  expect(admin).toContain("other.example.com."); expect(admin).toContain("personal.example.com.");
});
