import { expect, it } from "vitest";
import { GET, POST, DELETE } from "@/app/api/admin/allowlist/route";
it("does not expose or modify legacy allowlist data", () => {
  for (const handler of [GET, POST, DELETE]) expect(handler().status).toBe(410);
});
