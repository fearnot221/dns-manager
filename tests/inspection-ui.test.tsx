import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/client/use-resource", () => ({ useResource: vi.fn() }));
import { useResource } from "@/lib/client/use-resource";
import { InventoryViews } from "@/components/admin/inventory-views";
import { InventoryWorkbench } from "@/components/admin/inventory-workbench";
import { OwnershipDialog } from "@/components/records/ownership-dialog";
import { recordViews } from "@/components/records/view-options";
import type { InventoryRecord } from "@/lib/inventory/types";

const records: InventoryRecord[] = ["192.0.2.1", "192.0.2.2"].map((content) => ({ zoneName: "example.com.", recordName: "lab.example.com.", recordType: "A", content, ttl: 300, disabled: false, ownership: { id: content, applicantName: "申請人", applicantEmail: "", applicantUnit: "實驗室", applicantExtension: "1234", purpose: "研究", updatedAt: null, updatedBy: "", inspections: [] } }));
beforeEach(() => {
  vi.mocked(useResource).mockReturnValue({ data: { records }, error: "", loading: false, reload: vi.fn() } as never);
});
it.each(recordViews)("offers one clear inspection entry per value in $label", ({ key }) => {
  const html = renderToStaticMarkup(createElement(InventoryViews, { records, view: key, open: vi.fn() }));
  for (const record of records) expect(html.split(`aria-label="清查 ${record.recordName} ${record.content}"`)).toHaveLength(2);
  expect(html).not.toContain("的歸屬資料");
});
it("merges list actions into a single inspection entry", () => {
  const html = renderToStaticMarkup(createElement(InventoryWorkbench));
  for (const record of records) expect(html.split(`aria-label="清查 ${record.recordName} ${record.content}"`)).toHaveLength(2);
  expect(html).not.toContain("指派確認"); expect(html).not.toContain("歸屬／歷史"); expect(html).not.toContain("記錄清查");
});
it("keeps direct inspection and history without assignment controls for delegated admins", () => {
  const html = renderToStaticMarkup(createElement(OwnershipDialog, { record: records[0], inspection: true, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(html).toContain("DNS 清查"); expect(html).toContain("歷次清查"); expect(html).toContain("歸屬資料"); expect(html).toContain("儲存並記錄清查");
  expect(html).toContain('name="applicantName"'); expect(html).toContain('name="purpose"'); expect(html).toContain('name="note"');
  expect(html).toContain('value="metadata"'); expect(html).toContain('value="inspect-and-metadata"');
  expect(html).not.toContain('aria-label="清查操作"');
  expect(html).not.toContain("指派單位"); expect(html).not.toContain("回覆");
});

it("restores unit assignment inside the system administrator inspection dialog", () => {
  const html = renderToStaticMarkup(createElement(OwnershipDialog, { record: records[0], inspection: true, systemAdmin: true, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(html).toContain("指派單位"); expect(html).toContain("所屬單位");
  expect(html).not.toContain("回覆"); expect(html).not.toContain("通知");
  const reverse = renderToStaticMarkup(createElement(OwnershipDialog, { record: records[0], inspection: false, systemAdmin: true, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(reverse).not.toContain("指派單位"); expect(reverse).not.toContain('name="note"'); expect(reverse).not.toContain("儲存並記錄清查"); expect(reverse).toContain("儲存歸屬資料");
});

it.each([false, true])("shows history deletion only when owner permission is %s", (canDeleteInspections) => {
  const record = { ...records[0], ownership: { ...records[0].ownership, inspections: [{ id: "inspection", inspectedAt: "2026-09-29T00:00:00.000Z", inspectorId: "admin", inspectorName: "Admin", inspectorEmail: "admin@example.com", note: "原備註" }] } };
  const html = renderToStaticMarkup(createElement(OwnershipDialog, { record, inspection: true, systemAdmin: true, canDeleteInspections, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(html.includes(">刪除</button>")).toBe(canDeleteInspections);
  expect(html).toContain("原備註"); expect(html).toContain("歷次清查");
  expect(html).not.toContain("最高");
});

it("uses domain tabs and the original inspection rows without view or grouping controls", () => {
  vi.mocked(useResource).mockReturnValue({ data: { records: [...records, { ...records[0], zoneName: "other.com.", recordName: "hidden.other.com." }] }, loading: false, error: "", reload: vi.fn() } as never);
  const html = renderToStaticMarkup(createElement(InventoryWorkbench));
  expect(html).toContain('role="tablist"'); expect(html).toContain('aria-label="清查網域"');
  expect(html).toContain('role="tabpanel"'); expect(html).toContain("other.com.</button>");
  expect(html).toContain('class="inventory-row"'); expect(html).toContain("lab.example.com.");
  expect(html).not.toContain("hidden.other.com."); expect(html).not.toContain("檢視模式"); expect(html).not.toContain("清查分組");
});

it.each(["2.0.192.in-addr.arpa.", "8.b.d.0.1.0.0.2.ip6.arpa."])("shows a reverse domain tab and functional inspection fields: %s", (zoneName) => {
  const record = { ...records[0], zoneName, recordName: `1.${zoneName}`, recordType: "PTR", content: "host.example.com." };
  vi.mocked(useResource).mockReturnValue({ data: { records: [record] }, loading: false, error: "", reload: vi.fn() } as never);
  const html = renderToStaticMarkup(createElement(InventoryWorkbench));
  expect(html).toContain(`${zoneName}</button>`); expect(html).toContain(`清查 ${record.recordName} ${record.content}`);
  const dialog = renderToStaticMarkup(createElement(OwnershipDialog, { record, inspection: true, systemAdmin: true, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(dialog).toContain('name="note"'); expect(dialog).toContain("儲存並記錄清查");
  expect(dialog).not.toContain("指派單位");
});

it("places ee and ce first and initially shows ee, ahead of reverse domains", () => {
  const domains = ["z.example.", "ce.ncu.edu.tw.", "2.0.192.in-addr.arpa.", "EE.NCU.EDU.TW.", "a.example."];
  vi.mocked(useResource).mockReturnValue({ data: { records: domains.map((zoneName) => ({ ...records[0], zoneName, recordName: `host.${zoneName}` })) }, error: "", loading: false, reload: vi.fn() } as never);
  const html = renderToStaticMarkup(createElement(InventoryWorkbench));
  const labels = [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
  expect(labels).toEqual(["EE.NCU.EDU.TW.", "ce.ncu.edu.tw.", "2.0.192.in-addr.arpa.", "a.example.", "z.example."]);
  expect(html).toContain('aria-label="清查 host.EE.NCU.EDU.TW. 192.0.2.1"');
});
