import { createHash } from "node:crypto";
import { customFetch } from "@auth/core";
import type { OIDCConfig } from "next-auth/providers";
import { z } from "zod";

export const LOGTO_ISSUER = "https://authgate.ce.ncu.edu.tw/oidc";
export const LOGTO_CLIENT_ID = "dtvpigx50sgdvy4aeadee";
const displayName = z.string().trim().max(300).nullish();
const studentId = z.string().trim().max(100).nullish();
const identityDetailsSchema = z.object({
  name: displayName,
  identifier: studentId,
  username: displayName,
  "chinese-name": displayName,
  chineseName: displayName,
  rawData: z.unknown().optional(),
});
const identitySchema = z.object({ userId: z.string().min(1).max(300), details: z.unknown().optional() });
const identitiesSchema = z.record(z.string().min(1).max(200), identitySchema);
const profileSchema = z.object({ sub: z.string().min(1).max(200), identities: z.unknown().optional() });

function identityClaims(raw: unknown) {
  const identities = identitiesSchema.safeParse(raw);
  if (!identities.success) return { logtoName: null, displayName: null, identifier: null };

  const claims = Object.values(identities.data).flatMap(({ details }) => {
    const parsed = identityDetailsSchema.safeParse(details);
    if (!parsed.success) return [];
    const nested = identityDetailsSchema.safeParse(parsed.data.rawData);
    return [{
      identifier: parsed.data.identifier || (nested.success ? nested.data.identifier : null) || null,
      displayName: parsed.data.username || (nested.success ? nested.data.username : null) ||
        parsed.data["chinese-name"] || parsed.data.chineseName ||
        (nested.success ? nested.data["chinese-name"] || nested.data.chineseName : null) ||
        parsed.data.name || (nested.success ? nested.data.name : null) || null,
    }];
  });
  const identifiers = [...new Set(claims.flatMap(({ identifier }) => identifier ? [identifier] : []))];
  if (identifiers.length > 1) return { logtoName: null, displayName: null, identifier: null };
  const relevant = identifiers.length === 1 ? claims.filter((claim) => claim.identifier === identifiers[0]) : claims;
  const displayNames = [...new Set(relevant.flatMap(({ displayName }) => displayName ? [displayName] : []))];
  return {
    // logtoName is the legacy database field for the verified Portal identifier.
    logtoName: identifiers[0] || null,
    displayName: displayNames.length === 1 ? displayNames[0] : null,
    identifier: identifiers.length === 1 ? identifiers[0] : null,
  };
}

export function logtoIdentity(raw: unknown) {
  const profile = profileSchema.parse(raw);
  // Only connector-backed identities are trusted for Portal attributes. Conflicting
  // linked identities remain usable as an ordinary account but cannot authorize a role.
  const identity = identityClaims(profile.identities);
  return { id: profile.sub, logtoName: identity.logtoName, hasName: !!identity.displayName, name: identity.displayName || "未提供姓名", studentId: identity.identifier, portalEmail: null,
    email: `logto-${createHash("sha256").update(`${LOGTO_ISSUER}|${profile.sub}`).digest("hex")}@accounts.invalid` };
}
export const logtoConfigured = () => Boolean(process.env.DATABASE_URL && process.env.AUTH_LOGTO_SECRET);
export function logtoProvider(): OIDCConfig<Record<string, unknown>> {
  return {
    id: "logto", name: "NCU Portal", type: "oidc", issuer: LOGTO_ISSUER,
    wellKnown: `${LOGTO_ISSUER}/.well-known/openid-configuration`,
    clientId: process.env.AUTH_LOGTO_ID || LOGTO_CLIENT_ID, clientSecret: process.env.AUTH_LOGTO_SECRET,
    authorization: { params: { scope: "openid identities", prompt: "login" } },
    client: { token_endpoint_auth_method: "client_secret_basic", id_token_signed_response_alg: "ES384" },
    checks: ["pkce", "state", "nonce"],
    // Fetch connector-backed identities from UserInfo; Auth.js still verifies the
    // ID token and requires the UserInfo subject to match it.
    idToken: false,
    // The mapped email is a deterministic issuer+sub hash, never a provider or
    // user-controlled email, so Auth.js may safely recover a missing Account row.
    allowDangerousEmailAccountLinking: true,
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
