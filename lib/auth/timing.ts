import { AsyncLocalStorage } from "node:async_hooks";

const timings = new AsyncLocalStorage<{ id: string }>();

type LoginDenialReason = "subject_mismatch" | "account_name_missing" | "account_name_mismatch" | "account_inactive" | "owner_binding_mismatch" | "account_link_required" | "invalid_profile" | "account_lookup_failed" | "profile_update_failed";

/** Fixed reason codes only: never log claims, credentials, or raw database errors. */
export function denyLogtoLogin(reason: LoginDenialReason): false {
  console.warn(JSON.stringify({ event: "logto-signin-denied", requestId: timings.getStore()?.id, reason }));
  return false;
}

/** Only fixed stage names, duration and status; never URLs, codes or profiles. */
export async function measurePortalStep<T>(stage: "token" | "userinfo", operation: () => Promise<T>) {
  const started = performance.now();
  let completed = false;
  try { const result = await operation(); completed = true; return result; }
  finally {
    console.info(JSON.stringify({ event: "portal-timing", requestId: timings.getStore()?.id, stage, ms: Math.round(performance.now() - started), completed }));
  }
}

export async function measurePortalCallback(operation: () => Promise<Response>) {
  return timings.run({ id: crypto.randomUUID() }, async () => {
    const started = performance.now();
    let status = 500;
    try {
      const response = await operation();
      status = response.status;
      // Auth.js error redirects use Response.redirect(), whose headers are immutable.
      // Copy Headers directly to retain separate Set-Cookie values and stream the body.
      const headers = new Headers(response.headers);
      headers.append("Server-Timing", `portal_callback;dur=${(performance.now() - started).toFixed(1)}`);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } finally {
      console.info(JSON.stringify({ event: "portal-timing", requestId: timings.getStore()!.id, stage: "callback", ms: Math.round(performance.now() - started), status }));
    }
  });
}
