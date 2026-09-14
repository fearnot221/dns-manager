import { afterEach, expect, it, vi } from "vitest";
import { logtoIdentity, logtoProvider, logtoLogoutUrl, LOGTO_ISSUER } from "@/lib/auth/logto";
import { accountOwnerIdentifier } from "@/lib/auth/owner";
import { personDisplay } from "@/lib/users/display";
afterEach(() => vi.unstubAllEnvs());
it("uses OIDC with discovery, issuer checks, PKCE, state, nonce and ES384", () => {
  const provider = logtoProvider();
  expect(provider).toMatchObject({ id: "logto", type: "oidc", issuer: LOGTO_ISSUER, checks: ["pkce", "state", "nonce"], allowDangerousEmailAccountLinking: false, client: { id_token_signed_response_alg: "ES384" } });
  expect(provider.authorization).toMatchObject({ params: { scope: "openid profile custom_data", prompt: "login" } });
  expect(provider.account!({ access_token: "secret", refresh_token: "secret", id_token: "secret" })).toEqual({});
});
it("uses stable issuer-scoped subjects, verified emails only, and no claim-based roles", () => {
  const first = logtoIdentity({ sub: "opaque", custom_data: { username: "王小明" }, email: "FIRST@example.com", email_verified: true, roles: ["admin"], studentId: "115502532" });
  const second = logtoIdentity({ sub: "opaque", custom_data: { username: "王小明" }, email: "second@example.com", email_verified: false });
  expect(first.name).toBe("王小明"); expect(first.portalEmail).toBe("first@example.com");
  expect(second.portalEmail).toBeNull(); expect(first.email).toBe(second.email);
  expect(first).not.toHaveProperty("globalRole");
  expect(() => logtoIdentity({ name: "No subject" })).toThrow();
});
it("never guesses the Logto owner subject from a student ID", () => {
  vi.stubEnv("LOGTO_OWNER_SUB", "verified-logto-id");
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "115502532" }])).toBeNull();
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "verified-logto-id" }], "SUPER_ADMIN", "115502532")).toBe("115502532");
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
  expect(personDisplay({ name: "王小明", email: "student@example.com", studentId: "115500001" })).toEqual({ primary: "王小明", secondary: "student@example.com · 115500001" });
  expect(personDisplay({ email: "opaque@accounts.invalid", studentId: "115500001" })).toEqual({ primary: "115500001", secondary: "" });
  expect(personDisplay({ email: "opaque@accounts.invalid" }).primary).toBe("未提供姓名");
});

it("prefers Chinese-name claims, keeps student IDs auxiliary and never uses them for roles", () => {
  expect(logtoIdentity({ sub: "opaque", "chinese-name": " 王小明 ", chineseName: "其他姓名", name: "115502532", "student-id": "115502532" })).toMatchObject({ name: "王小明", hasName: true, studentId: "115502532" });
  expect(logtoIdentity({ sub: "opaque", chineseName: "王小明" }).name).toBe("王小明");
  expect(logtoIdentity({ sub: "opaque", "chinese-name": " ", chineseName: "映射姓名" }).name).toBe("映射姓名");
  expect(logtoIdentity({ sub: "opaque", username: "115502532" })).toMatchObject({ name: "未提供姓名", hasName: false, studentId: null });
});

it("requires current Logto binding and stored owner role, not historical student identifiers", () => {
  vi.stubEnv("LOGTO_OWNER_SUB", "owner-sub");
  expect(accountOwnerIdentifier([{ provider: "ncu-portal", providerAccountId: "115502532" }], "SUPER_ADMIN")).toBeNull();
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "other" }], "SUPER_ADMIN")).toBeNull();
});

it("prefers custom_data.username for new-user display without accepting custom identity or roles", async () => {
  const profile = { sub: "ordinary", custom_data: { username: " 王小明 ", sub: "owner-sub", globalRole: "SUPER_ADMIN" }, "chinese-name": "其他姓名", name: "English" };
  const identity = logtoIdentity(profile);
  expect(identity).toMatchObject({ id: "ordinary", name: "王小明", hasName: true });
  expect(identity.email).toBe(logtoIdentity({ sub: "ordinary" }).email);
  expect(await logtoProvider().profile!(profile, {})).toMatchObject({ id: "ordinary", name: "王小明", globalRole: "USER" });
});

it.each([undefined, null, [], "bad", {}, { username: null }, { username: "  " }, { username: 123 }, { username: "x".repeat(301) }])("falls back safely for missing or invalid custom display data: %j", (custom_data) => {
  expect(logtoIdentity({ sub: "ordinary", custom_data, "chinese-name": "原姓名" })).toMatchObject({ name: "原姓名", hasName: true });
  expect(logtoIdentity({ sub: "ordinary", custom_data })).toMatchObject({ name: "未提供姓名", hasName: false });
});
