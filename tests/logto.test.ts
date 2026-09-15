import { afterEach, expect, it, vi } from "vitest";
import { logtoIdentity, logtoProvider, logtoLogoutUrl, LOGTO_ISSUER } from "@/lib/auth/logto";
import { accountOwnerIdentifier } from "@/lib/auth/owner";
import { personDisplay } from "@/lib/users/display";
const portalIdentity = (identifier?: string, username?: string, name = "Portal profile name") => ({ ncu: { userId: "portal-user", details: { name, rawData: { username, identifier } } } });
afterEach(() => vi.unstubAllEnvs());
it("uses OIDC with discovery, issuer checks, PKCE, state, nonce and ES384", () => {
  const provider = logtoProvider();
  expect(provider).toMatchObject({ id: "logto", type: "oidc", issuer: LOGTO_ISSUER, checks: ["pkce", "state", "nonce"], allowDangerousEmailAccountLinking: false, client: { id_token_signed_response_alg: "ES384" } });
  expect(provider.authorization).toMatchObject({ params: { scope: "openid identities", prompt: "login" } });
  expect(provider.account!({ access_token: "secret", refresh_token: "secret", id_token: "secret" })).toEqual({});
});
it("uses stable issuer-scoped subjects, identity details, and no unrelated claims", () => {
  const first = logtoIdentity({ sub: "opaque", identities: portalIdentity("115502532", "王小明"), email: "FIRST@example.com", email_verified: true, roles: ["admin"] });
  const second = logtoIdentity({ sub: "opaque", identities: portalIdentity("115502532", "王小明"), email: "second@example.com", email_verified: false });
  expect(first).toMatchObject({ name: "王小明", logtoName: "115502532", studentId: "115502532", portalEmail: null });
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
  expect(personDisplay({ name: "王小明", email: "student@example.com", studentId: "115500001" })).toEqual({ primary: "王小明", secondary: "115500001 · student@example.com" });
  expect(personDisplay({ email: "opaque@accounts.invalid", studentId: "115500001" })).toEqual({ primary: "115500001", secondary: "" });
  expect(personDisplay({ email: "opaque@accounts.invalid" }).primary).toBe("未提供姓名");
});

it("reads Portal attributes only from a single consistent linked identity", () => {
  expect(logtoIdentity({ sub: "opaque", identities: { ncu: { userId: "id", details: { name: "不作授權的姓名", identifier: " ncu-account ", "chinese-name": " 王小明 " } } } })).toMatchObject({ name: "王小明", hasName: true, logtoName: "ncu-account", studentId: "ncu-account" });
  expect(logtoIdentity({ sub: "opaque", identities: { ncu: { userId: "id", details: { identifier: "student", rawData: { chineseName: "映射姓名" } } } } }).name).toBe("映射姓名");
  expect(logtoIdentity({ sub: "opaque", name: "115502532", username: "王小明", custom_data: { username: "王小明" } })).toMatchObject({ name: "未提供姓名", hasName: false, studentId: null });
});

it("requires current Logto binding and stored owner role, not historical student identifiers", () => {
  vi.stubEnv("LOGTO_OWNER_SUB", "owner-sub");
  expect(accountOwnerIdentifier([{ provider: "ncu-portal", providerAccountId: "115502532" }], "SUPER_ADMIN")).toBeNull();
  expect(accountOwnerIdentifier([{ provider: "logto", providerAccountId: "other" }], "SUPER_ADMIN")).toBeNull();
});

it("uses identities details for display without accepting embedded roles or subjects", async () => {
  const profile = { sub: "ordinary", identities: { ncu: { userId: "portal-user", details: { name: "顯示姓名", rawData: { username: " 王小明 ", identifier: "115502532", sub: "owner-sub", globalRole: "SUPER_ADMIN" } } } } };
  const identity = logtoIdentity(profile);
  expect(identity).toMatchObject({ id: "ordinary", name: "王小明", hasName: true });
  expect(identity.email).toBe(logtoIdentity({ sub: "ordinary" }).email);
  expect(await logtoProvider().profile!(profile, {})).toMatchObject({ id: "ordinary", name: "王小明", globalRole: "USER" });
});

it.each([undefined, null, [], "bad", {}, { ncu: null }, { ncu: { userId: "id", details: "bad" } }])("falls back safely for missing or invalid identities: %j", (identities) => {
  expect(logtoIdentity({ sub: "ordinary", identities })).toMatchObject({ name: "未提供姓名", hasName: false, logtoName: null });
});

it("fails closed for conflicting linked identity identifiers", () => {
  const identities = {
    ncu: { userId: "one", details: { identifier: "115502532", username: "王小明" } },
    other: { userId: "two", details: { identifier: "111504515", username: "另一人" } },
  };
  expect(logtoIdentity({ sub: "ordinary", identities })).toMatchObject({ name: "未提供姓名", logtoName: null, studentId: null });
});

it("uses identifier for authorization and keeps the identity name display-only", () => {
  expect(logtoIdentity({ sub: "ordinary", identities: portalIdentity("fearnot", "王小明", "115502532") })).toMatchObject({
    logtoName: "fearnot",
    studentId: "fearnot",
    name: "王小明",
  });
});
