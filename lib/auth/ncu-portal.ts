import { customFetch } from "@auth/core";
import type { OAuthConfig } from "next-auth/providers";
import { z } from "zod";
import { isOwnerEmail, OWNER_EMAIL } from "./owner";

const schema = z.object({ identifier: z.string().trim().min(1).max(200), chineseName: z.string().optional().nullable(), email: z.email().optional().nullable(), emailVerified: z.boolean().optional(), delegator: z.unknown().optional() });
export function portalIdentity(raw: unknown, ownerIdentifier = process.env.NCU_OWNER_IDENTIFIER) {
  const profile = schema.parse(raw);
  if (profile.delegator !== undefined && profile.delegator !== null) throw new Error("Portal delegated sign-in is not allowed");
  const owner = !!ownerIdentifier && profile.identifier === ownerIdentifier;
  // Bind the owner by an operator-verified Portal identifier, never a supplied email.
  if (!owner && (!profile.email || profile.emailVerified !== true || isOwnerEmail(profile.email))) throw new Error("A verified non-owner contact email is required");
  return { id: profile.identifier, name: profile.chineseName || profile.identifier, email: owner ? OWNER_EMAIL : profile.email!.toLowerCase(), owner };
}
export const portalConfigured = () => Boolean(process.env.DATABASE_URL && process.env.NCU_PORTAL_CLIENT_ID && process.env.NCU_PORTAL_CLIENT_SECRET && process.env.NCU_OWNER_IDENTIFIER);
export function ncuPortalProvider(): OAuthConfig<Record<string, unknown>> {
  return {
    id: "ncu-portal", name: "NCU Portal", type: "oauth",
    clientId: process.env.NCU_PORTAL_CLIENT_ID, clientSecret: process.env.NCU_PORTAL_CLIENT_SECRET,
    authorization: { url: "https://portal.ncu.edu.tw/oauth2/authorization", params: { scope: "identifier chinese-name email" } },
    token: "https://portal.ncu.edu.tw/oauth2/token",
    userinfo: "https://portal.ncu.edu.tw/apis/oauth/v1/info",
    client: { token_endpoint_auth_method: "client_secret_basic" },
    checks: ["state"],
    allowDangerousEmailAccountLinking: false,
    profile(raw) { const identity = portalIdentity(raw); return { id: identity.id, name: identity.name, email: identity.email, globalRole: "USER" }; },
    // Do not retain Portal access/refresh tokens: the app only needs initial identity.
    account() { return {}; },
    [customFetch](input, init) { const headers = new Headers(init?.headers); headers.set("Accept", "application/json"); return fetch(input, { ...init, headers, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(10_000) }); },
  };
}
