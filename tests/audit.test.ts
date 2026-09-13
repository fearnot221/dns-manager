import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true, localDocument: vi.fn() }));
import { requireActor } from "@/lib/auth/session";
import { localDocument } from "@/lib/db/local-store";
import { logAuditEvent, localAuditEvents } from "@/lib/audit/service";
import { redactAudit } from "@/lib/audit/redact";
import { auditMutation } from "@/lib/audit/mutation";
import { GET } from "@/app/api/audit/route";
const actor = { id: "dev-admin", email: "admin@example.com", globalRole: "ADMIN" as const, zoneRoles: {} };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "");
  const documents: Record<string, unknown> = {};
  vi.mocked(localDocument).mockImplementation(async (name, initial, operation) => { documents[name] ??= await initial(); return operation(documents[name]); });
  vi.mocked(requireActor).mockResolvedValue(actor);
});
afterEach(() => vi.unstubAllEnvs());
it("recursively masks secrets while keeping business changes", () => {
  vi.stubEnv("PDNS_API_KEY", "never-store-this-value");
  const data = redactAudit({ password: "plain", nested: [{ apiKey: "plain", content: "never-store-this-value", applicantUnit: "教學組" }], authorization: "Bearer abc", createdAt: new Date("2026-01-01") });
  expect(JSON.stringify(data)).not.toMatch(/plain|never-store-this-value|Bearer abc/);
  expect(JSON.stringify(data)).toContain("教學組");
});
it("persists real demo events and restricts access to global admins", async () => {
  await logAuditEvent({ actor, zone: "example.com.", action: "UPDATE_RECORD", before: { ttl: 300 }, after: { ttl: 600 }, success: true });
  const response = await GET(new Request("http://localhost/api/audit?q=example.com"));
  const result = await response.json();
  expect(result.total).toBe(1); expect(result.events[0]).toMatchObject({ oldValue: { ttl: 300 }, newValue: { ttl: 600 }, userEmail: actor.email });
  vi.mocked(requireActor).mockResolvedValue({ ...actor, globalRole: "USER", zoneRoles: { "example.com.": "ADMIN" } });
  expect((await GET(new Request("http://localhost/api/audit"))).status).toBe(403);
});
it("records intent before running, correlates completion and preserves failure status", async () => {
  const handler = vi.fn(async () => {
    expect((await localAuditEvents())[0].action).toBe("MUTATION_STARTED");
    return Response.json({ error: "Version conflict" }, { status: 409 });
  });
  const result = await auditMutation(handler)(new Request("http://localhost/api/users/test", { method: "PATCH" }));
  const events = await localAuditEvents();
  expect(result.status).toBe(409); expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({ action: "MUTATION_COMPLETED", success: false, requestId: events[0].requestId });
  expect(result.headers.get("x-request-id")).toBe(events[0].requestId);
});
it("blocks changes if the initial audit write fails", async () => {
  vi.mocked(localDocument).mockRejectedValueOnce(new Error("disk full"));
  const handler = vi.fn(async () => Response.json({ ok: true }));
  expect((await auditMutation(handler)(new Request("http://localhost/api/users", { method: "POST" }))).status).toBe(503);
  expect(handler).not.toHaveBeenCalled();
});
it("accepts framework-proxied requests without consuming or losing the body", async () => {
  const native = new Request("http://localhost/api/users", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "untrusted-client-id" }, body: JSON.stringify({ name: "Test" }) });
  const proxied = new Proxy(native, { get(target, property) { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; } });
  const result = await auditMutation(async (request) => {
    expect(await request.json()).toEqual({ name: "Test" });
    expect(request.headers.get("x-request-id")).not.toBe("untrusted-client-id");
    return Response.json({ ok: true });
  })(proxied);
  expect(result.status).toBe(200);
});
it("validates pagination and filters by failure", async () => {
  await logAuditEvent({ actor, zone: "", action: "UPDATE_USER", success: false, errorMessage: "denied" });
  expect((await (await GET(new Request("http://localhost/api/audit?status=failed"))).json()).total).toBe(1);
  expect((await GET(new Request("http://localhost/api/audit?page=0"))).status).toBe(400);
});
