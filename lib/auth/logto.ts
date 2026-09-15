import { createHash } from "node:crypto";
import { customFetch } from "@auth/core";
import type { OIDCConfig } from "next-auth/providers";
import { z } from "zod";

export const LOGTO_ISSUER = "https://authgate.ce.ncu.edu.tw/oidc";
export const LOGTO_CLIENT_ID = "dtvpigx50sgdvy4aeadee";
const displayName = z.string().trim().max(300).nullish();
const studentId = z.string().trim().max(100).nullish();
const customNameSchema = z.object({ username: displayName });
const profileSchema = z.object({ sub: z.string().min(1).max(200), custom_data: z.unknown().optional(), "chinese-name": displayName, chineseName: displayName, name: displayName, "student-id": studentId, studentId, email: z.email().optional().nullable(), email_verified: z.boolean().optional() });
export function logtoIdentity(raw: unknown) {
  const profile = profileSchema.parse(raw);
  // Optional display metadata must not block login or influence account identity.
  const custom = customNameSchema.safeParse(profile.custom_data);
  const name = (custom.success ? custom.data.username : null) || profile["chinese-name"] || profile.chineseName;
  return { id: profile.sub, logtoName: profile.name || null, hasName: !!name, name: name || "未提供姓名", studentId: profile.name || profile["student-id"] || profile.studentId || null, portalEmail: profile.email_verified === true ? profile.email?.toLowerCase() || null : null,
    email: `logto-${createHash("sha256").update(`${LOGTO_ISSUER}|${profile.sub}`).digest("hex")}@accounts.invalid` };
}
export const logtoConfigured = () => Boolean(process.env.DATABASE_URL && process.env.AUTH_LOGTO_SECRET);
export function logtoProvider(): OIDCConfig<Record<string, unknown>> {
  return {
    id: "logto", name: "NCU Portal", type: "oidc", issuer: LOGTO_ISSUER,
    wellKnown: `${LOGTO_ISSUER}/.well-known/openid-configuration`,
    clientId: process.env.AUTH_LOGTO_ID || LOGTO_CLIENT_ID, clientSecret: process.env.AUTH_LOGTO_SECRET,
    authorization: { params: { scope: "openid profile identities", prompt: "login" } },
    client: { token_endpoint_auth_method: "client_secret_basic", id_token_signed_response_alg: "ES384" },
    checks: ["pkce", "state", "nonce"],
    // Fetch full profile; Auth.js still verifies the ID token and userinfo subject.
    idToken: false,
    allowDangerousEmailAccountLinking: false,
    profile(raw) { const identity = logtoIdentity(raw); return { id: identity.id, email: identity.email, name: identity.name, logtoName: identity.logtoName, studentId: identity.studentId, portalEmail: identity.portalEmail, globalRole: "USER" }; },
    account() { return {}; },
    [customFetch](input, init) {
      const timeout = AbortSignal.timeout(10_000);
      return fetch(input, { ...init, cache: "no-store", redirect: "error", signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    },
  };
}

export function logtoLogoutUrl(idToken: string, authUrl: string) {
  const origin = new URL(authUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid AUTH_URL");
  const url = new URL(`${LOGTO_ISSUER}/session/end`);
  url.searchParams.set("id_token_hint", idToken);
  url.searchParams.set("post_logout_redirect_uri", new URL("/login", origin).href);
  return url.href;
}
