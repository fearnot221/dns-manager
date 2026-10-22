import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InspectionStatusField } from "@/components/records/inspection-status-field";
import { recordStatusLabel, recordStatuses } from "@/lib/inventory/record-status";

it("labels the statuses and keeps legacy records unset", () => {
  expect(recordStatuses.map(recordStatusLabel)).toEqual(["使用中", "棄用", "保留", "停用"]);
  expect(recordStatusLabel(null)).toBe("未設定");
});
it("restores the draft's status visibly and associates the deletion notice with the control", () => {
  const html = renderToStaticMarkup(createElement(InspectionStatusField, { status: "IN_USE", drafts: new Map([["record", { recordStatus: "RESERVED" }]]), draftKey: "record" }));
  expect(html).toContain('value="RESERVED"');
  expect(html).toContain('>保留</span>');
  expect(html).toContain('aria-label="狀態"');
  const helpId = html.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(helpId).toBeTruthy();
  expect(html).toContain(`id="${helpId}"`);
  expect(html).toContain("將由機房端於清查後刪除");
});
