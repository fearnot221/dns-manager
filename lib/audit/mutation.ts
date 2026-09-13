import { requireActor } from "@/lib/auth/session";
import { logAuditEvent } from "./service";

/** Durable intent before mutation; a missing completion identifies interrupted work. */
export function auditMutation<Args extends unknown[]>(handler: (request: Request, ...args: Args) => Promise<Response>) {
  return async (original: Request, ...args: Args): Promise<Response> => {
    const headers = new Headers(original.headers);
    headers.set("x-request-id", crypto.randomUUID());
    // Next may wrap its Request in a proxy; passing it to Undici's Request
    // constructor fails native private-field checks. Copy its public fields.
    const init: RequestInit & { duplex: "half" } = { method: original.method, headers, body: original.body, duplex: "half", signal: original.signal };
    const request = new Request(original.url, init);
    const actor = await requireActor().catch(() => null);
    if (!actor) return handler(request, ...args); // Rejected unauthenticated requests cannot mutate data.
    const target = { method: request.method, path: new URL(request.url).pathname };
    // The detailed domain events hold state snapshots. Do not read arbitrary request bodies here.
    try { await logAuditEvent({ actor, zone: "", action: "MUTATION_STARTED", after: target, success: true, request }); }
    catch { return Response.json({ error: "操作紀錄暫時無法寫入，未執行此變更。" }, { status: 503 }); }
    const started = performance.now();
    let response: Response;
    try { response = await handler(request, ...args); }
    catch { response = Response.json({ error: "操作未完成，請以請求編號查詢紀錄。" }, { status: 500 }); }
    try {
      const error = response.ok ? undefined : await response.clone().json().catch(() => ({ error: "Non-JSON error response" }));
      await logAuditEvent({ actor, zone: "", action: "MUTATION_COMPLETED", after: { ...target, status: response.status, durationMs: Math.round(performance.now() - started), error }, success: response.ok, request });
    } catch {
      console.error(JSON.stringify({ event: "AUDIT_COMPLETION_FAILED", requestId: headers.get("x-request-id"), ...target, status: response.status }));
      response.headers.set("X-Audit-Warning", "completion-unavailable");
    }
    response.headers.set("X-Request-ID", headers.get("x-request-id")!);
    return response;
  };
}
