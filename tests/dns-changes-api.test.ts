import { expect, it } from "vitest";
import { GET } from "@/app/api/dns-changes/route";
import { POST } from "@/app/api/dns-changes/[id]/restore/route";
import { workspaceNavigation } from "@/lib/client/navigation";
it("retires history and restore endpoints and removes history navigation", async () => {
  expect((await GET()).status).toBe(410);
  expect((await POST()).status).toBe(410);
  expect(workspaceNavigation(true, true)[0].items.some((item) => item.href === "/admin/dns-changes")).toBe(false);
});
