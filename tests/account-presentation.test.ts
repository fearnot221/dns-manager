import { expect, it } from "vitest";
import { accountPresentation } from "@/lib/users/presentation";
import { isOwner, resolvedGlobalRole } from "@/lib/auth/owner";
it("never grants ownership by email, student display or notes", () => {
  const user = { id: "u", email: "owner@example.invalid", globalRole: "SUPER_ADMIN" as const, studentId: "115502532", note: "115502532" };
  expect(accountPresentation(user)).toMatchObject({ protected: false, globalRole: "ADMIN" });
  expect(isOwner({ ...user, zoneRoles: {} })).toBe(false);
  expect(resolvedGlobalRole("unrelated@example.com", "USER", "115502532")).toBe("USER");
});
it("shows email and a human name without changing the login account", () => {
  const result = accountPresentation({ id: "u", name: "測試姓名", email: "secret@example.com", studentId: "115500001", note: "測試備註", globalRole: "USER", accounts: [{ providerAccountId: "portal-account" }] });
  expect(result.account).toBe("portal-account");
  expect(result.note).toBe("測試備註");
  expect(result.email).toBe("secret@example.com");
  expect(result.name).toBe("測試姓名");
});
it("does not expose synthetic login emails and uses Portal contact email only for display", () => {
  const user = { id: "u", email: "portal-hash@accounts.invalid", globalRole: "USER" as const, accounts: [{ providerAccountId: "someone" }] };
  expect(accountPresentation(user)).toMatchObject({ email: null, account: "someone" });
  expect(accountPresentation({ ...user, portalEmail: "owner@example.invalid" })).toMatchObject({ email: "owner@example.invalid", account: "someone", protected: false, globalRole: "USER" });
  expect(accountPresentation({ id: "u", email: "test@example.com", globalRole: "USER" })).toMatchObject({ email: "test@example.com", account: "test@example.com" });
});
