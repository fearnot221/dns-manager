import { afterEach, expect, it, vi } from "vitest";
import { logtoIdentity, logtoProvider, logtoLogoutUrl, LOGTO_ISSUER } from "@/lib/auth/logto";
import { accountOwnerIdentifier } from "@/lib/auth/owner";
import { personDisplay } from "@/lib/users/display";
afterEach(() => vi.unstubAllEnvs());
it("uses OIDC with discovery, issuer checks, PKCE, state, nonce and ES384", () => {
  const provider = logtoProvider();
  expect(provider).toMatchObject({ id: "logto", type: "oidc", issuer: LOGTO_ISSUER, checks: ["pkce", "state", "nonce"], allowDangerousEmailAccountLinking: false, client: { id_token_signed_response_alg: "ES384" } });
  expect(provider.authorization).toMatchObject({ params: { scope: "openid profile email" } });
  expect(provider.account!({ access_token: "secret", refresh_token: "secret", id_token: "secret" })).toEqual({});
});
it("uses stable issuer-scoped subjects, verified emails only, and no claim-based roles", () => {
  const first = logtoIdentity({ sub: "opaque", name: "王小明", email: "FIRST@example.com", email_verified: true, roles: ["admin"], studentId: "115502532" });
  const second = logtoIdentity({ sub: "opaque", name: "王小明", email: "second@example.com", email_verified: false });
  expect(first.name).toBe("王小明"); expect(first.portalEmail).toBe("first@example.com");
  expect(second.portalEmail).toBeNull(); expect(first.email).toBe(second.email);
  expect(first).not.toHaveProperty("globalRole");
  expect(() => logtoIdentity({ name: "No subject" })).toThrow();
});
it("never guesses the Logto owner subject from a student ID", () => {
  vi.stubEnv("LOGTO_OWNER_SUB", "verified-logto-id");
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "115502532" }])).toBeNull();
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "verified-logto-id" }], "SUPER_ADMIN")).toBe("115502532");
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "verified-logto-id" }], "USER")).toBeNull();
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "verified-logto-id" }], "ADMIN")).toBeNull();
});
it("keeps logout destination fixed to Logto with the configured application return URI", () => {
  const url = new URL(logtoLogoutUrl("test-id-token", "https://dnsmgr.ce.ncu.edu.tw"));
  expect(url.origin + url.pathname).toBe(`${LOGTO_ISSUER}/session/end`);
  expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://dnsmgr.ce.ncu.edu.tw/login");
  expect(() => logtoLogoutUrl("token", "https://example.com/evil")).toThrow();
});
it("presents names first, identifiers second, and hides synthetic email addresses", () => {
  expect(personDisplay({ name: "王小明", email: "student@example.com", studentId: "115500001" })).toEqual({ primary: "王小明", secondary: "student@example.com" });
  expect(personDisplay({ email: "opaque@accounts.invalid", studentId: "115500001" })).toEqual({ primary: "115500001", secondary: "" });
  expect(personDisplay({ email: "opaque@accounts.invalid" }).primary).toBe("未提供姓名");
});
