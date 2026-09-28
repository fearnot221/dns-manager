import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { UnitRecordFields } from "@/components/units/unit-record-fields";
it("prefills editable inspection contact fields and purpose while fixing the unit", () => {
  const html = renderToStaticMarkup(createElement(UnitRecordFields, { record: { applicantName: "聯絡人", applicantEmail: "contact@example.com", applicantExtension: "1234", applicantUnit: "實驗室", purpose: "網站用途" } }));
  for (const name of ["applicantName", "applicantEmail", "applicantExtension", "purpose"]) expect(html).toContain(`name="${name}"`);
  expect(html).toContain('value="contact@example.com"'); expect(html).toContain("網站用途</textarea>");
  expect(html).toContain('readOnly="" value="實驗室"'); expect(html).not.toContain('name="unitId"'); expect(html).not.toContain('name="applicantUnit"');
});
