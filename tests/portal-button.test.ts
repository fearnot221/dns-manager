import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PortalSignIn } from "@/components/auth/portal-sign-in";

it("keeps NCU Portal branding when Logto is available", () => {
  const html = renderToStaticMarkup(createElement(PortalSignIn, { available: true }));
  expect(html).toContain("連接至 NCU Portal");
  expect(html).not.toContain("disabled=");
});
it("retains a disabled button with an associated explanation when unconfigured", () => {
  const html = renderToStaticMarkup(createElement(PortalSignIn, { available: false, unavailableReason: "設定尚未完成" }));
  expect(html).toContain("連接至 NCU Portal");
  expect(html).toContain('disabled=""');
  expect(html).toContain("aria-describedby=");
  expect(html).toContain("設定尚未完成");
});
