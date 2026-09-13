import { expect, it } from "vitest";
import { accountPresentation } from "@/lib/users/presentation";
import { isOwner, resolvedGlobalRole } from "@/lib/auth/owner";
it("never grants ownership by email, student display or notes", () => {
  const user = { id: "u", email: "fearnot@ce.ncu.edu.tw", globalRole: "SUPER_ADMIN" as const, studentId: "115502532", note: "115502532" };
  expect(accountPresentation(user)).toMatchObject({ protected: false, globalRole: "ADMIN" });
  expect(isOwner({ ...user, zoneRoles: {} })).toBe(false);
  expect(resolvedGlobalRole("unrelated@example.com", "USER", "115502532")).toBe("SUPER_ADMIN");
});
it("returns only account labels and administrative fields", () => {
  const result = accountPresentation({ id: "u", email: "secret@example.com", studentId: "115500001", note: "測試備註", globalRole: "USER", accounts: [{ providerAccountId: "portal-account" }] });
  expect(result.account).toBe("115500001");
  expect(result.note).toBe("測試備註");
  expect(result).not.toHaveProperty("email");
  expect(result).not.toHaveProperty("name");
});
