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
it("keeps direct inspection and history without any assignment or response controls", () => {
  const html = renderToStaticMarkup(createElement(OwnershipDialog, { record: records[0], inspection: true, onClose: vi.fn(), onSaved: vi.fn(async () => {}) }));
  expect(html).toContain("DNS 清查"); expect(html).toContain("歷次清查"); expect(html).toContain("歸屬資料"); expect(html).toContain("確認清查並記錄");
  expect(html).not.toContain("指派單位"); expect(html).not.toContain("回覆");
});
