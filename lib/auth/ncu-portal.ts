import { createHash } from "node:crypto";
import { customFetch } from "@auth/core";
import type { OAuthConfig } from "next-auth/providers";
import { z } from "zod";
import { OWNER_IDENTIFIER, OWNER_EMAIL } from "./owner";
import { measurePortalStep } from "./timing";

const schema = z.object({ studentId: z.string().trim().min(1).max(100).optional().nullable(), identifier: z.string().trim().min(1).max(200), chineseName: z.string().optional().nullable(), email: z.email().optional().nullable(), emailVerified: z.boolean().optional(), delegator: z.unknown().optional() });
export function portalIdentity(raw: unknown, ownerIdentifier = OWNER_IDENTIFIER) {
  const profile = schema.parse(raw);
  if (profile.delegator !== undefined && profile.delegator !== null) throw new Error("Portal delegated sign-in is not allowed");
  const owner = !!ownerIdentifier && profile.identifier === ownerIdentifier;
  // Bind the owner by an operator-verified Portal identifier, never a supplied email.

  return { id: profile.identifier, name: profile.studentId || profile.identifier, studentId: profile.studentId || null, email: owner ? OWNER_EMAIL : `portal-${createHash("sha256").update(profile.identifier).digest("hex")}@accounts.invalid`, owner };
}
export const portalConfigured = () => Boolean(process.env.DATABASE_URL && process.env.NCU_PORTAL_CLIENT_ID && process.env.NCU_PORTAL_CLIENT_SECRET && process.env.NCU_OWNER_IDENTIFIER);
export function ncuPortalProvider(): OAuthConfig<Record<string, unknown>> {
  return {
    id: "ncu-portal", name: "NCU Portal", type: "oauth",
    clientId: process.env.NCU_PORTAL_CLIENT_ID, clientSecret: process.env.NCU_PORTAL_CLIENT_SECRET,
    authorization: { url: "https://portal.ncu.edu.tw/oauth2/authorization", params: { scope: "identifier student-id" } },
    token: "https://portal.ncu.edu.tw/oauth2/token",
    userinfo: "https://portal.ncu.edu.tw/apis/oauth/v1/info",
    client: { token_endpoint_auth_method: "client_secret_basic" },
    checks: ["state"],
    allowDangerousEmailAccountLinking: false,
    profile(raw) { const identity = portalIdentity(raw); return { id: identity.id, name: identity.name, studentId: identity.studentId, email: identity.email, globalRole: "USER" }; },
    // Do not retain Portal access/refresh tokens: the app only needs initial identity.
    account() { return {}; },
    [customFetch](input, init) {
      const headers = new Headers(init?.headers);
      headers.set("Accept", "application/json");
      const url = new URL(input instanceof Request ? input.url : String(input));
      const stage = url.pathname === "/oauth2/token" ? "token" : "userinfo";
      const timeout = AbortSignal.timeout(10_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return measurePortalStep(stage, async () => {
        const response = await fetch(input, { ...init, headers, cache: "no-store", redirect: "error", signal });
        // Include response-body transfer in timing and timeout coverage.
        const body = await response.arrayBuffer();
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      });
    },
  };
}
