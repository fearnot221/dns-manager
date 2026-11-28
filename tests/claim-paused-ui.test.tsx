import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn() }));
import { requireActor } from "@/lib/auth/session";
import Page from "@/app/(workspace)/requests/claim/page";

it("shows an authenticated pause notice without an application form", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
  const html = renderToStaticMarkup(await Page());
  expect(requireActor).toHaveBeenCalledOnce();
  expect(html).toContain("DNS 歸屬申請功能暫時關閉");
  expect(html).not.toContain("<form");
});
