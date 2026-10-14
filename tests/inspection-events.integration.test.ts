import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/db/client", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasourceUrl: process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused" }) };
});
import { db } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import type { Actor } from "@/lib/dns/types";
import { OWNER_IDENTIFIER } from "@/lib/auth/owner";
import { changeInspectionEvent, currentInspectionEvent, inspectionEventSnapshot, listInspectionEvents } from "@/lib/inspection-events/service";
import { GET, POST, PATCH, DELETE } from "@/app/api/admin/inspection-events/route";
import { GET as current } from "@/app/api/inspection-events/current/route";

const url = process.env.UNIT_TEST_DATABASE_URL;
let admin: Actor, user: Actor;
const event = { name: "Test event", startsOn: "2040-10-04", endsOn: "2040-10-31" };
const ids: string[] = [];
const request = (method: string, body: unknown, origin = "http://localhost") => new Request("http://localhost/api/admin/inspection-events", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!url)("inspection events with isolated PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/dns_units_test") throw new Error("Use disposable localhost dns_units_test only");
    vi.stubEnv("DATABASE_URL", url!);
    const a = await db.user.create({ data: { email: `${crypto.randomUUID()}@event-test.invalid`, globalRole: "ADMIN" } });
    const u = await db.user.create({ data: { email: `${crypto.randomUUID()}@event-test.invalid` } });
    admin = { ...a, zoneRoles: {} }; user = { ...u, zoneRoles: { "example.com.": "ADMIN" } };
  });
  afterAll(async () => {
    await db.inspectionEvent.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("blocks anonymous and delegated admins from management, including direct service writes", async () => {
    const { AuthError } = await import("@/lib/auth/session");
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await GET()).status).toBe(401); expect((await current()).status).toBe(401);
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE]] as const) expect((await handler(request(method, event))).status).toBe(401);
    vi.mocked(requireActor).mockResolvedValue(user);
    expect((await GET()).status).toBe(403);
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE]] as const) expect((await handler(request(method, event))).status).toBe(403);
    await expect(listInspectionEvents(user)).rejects.toMatchObject({ status: 403 });
    await expect(changeInspectionEvent(user, { kind: "create", event })).rejects.toMatchObject({ status: 403 });
    const response = await current();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects cross-origin writes and malformed dates without creating events", async () => {
    vi.mocked(requireActor).mockResolvedValue(admin);
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE]] as const) expect((await handler(request(method, event, "https://evil.invalid"))).status).toBe(403);
    for (const bad of [{ name: " " }, { startsOn: "2040-02-30" }, { endsOn: "2040-10-03" }, { eventId: "forged" }]) expect((await POST(request("POST", { ...event, ...bad }))).status).toBe(400);
  });
  it("creates, reads, updates and deletes with stale-edit protection and persistent history snapshots", async () => {
    vi.mocked(requireActor).mockResolvedValue(admin);
    const created = await POST(request("POST", event));
    expect(created.status).toBe(201);
    const saved = (await created.json()).event; ids.push(saved.id);
    const list = await GET();
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect((await list.json()).events).toContainEqual({ ...event, id: saved.id, revision: 1 });
    for (const timestamp of ["2040-10-03T16:00:00Z", "2040-10-31T15:59:59.999Z"]) expect(await currentInspectionEvent(new Date(timestamp))).toEqual(event);
    for (const timestamp of ["2040-10-03T15:59:59.999Z", "2040-10-31T16:00:00Z"]) expect(await currentInspectionEvent(new Date(timestamp))).toBeNull();
    const snapshot = await inspectionEventSnapshot(new Date("2040-10-04T00:00:00Z"));
    expect(snapshot).toEqual({ eventId: saved.id, eventName: event.name, eventClassified: true });
    const record = await db.dnsRecordMetadata.create({ data: { id: crypto.randomUUID(), zoneName: "example.com.", recordName: "test.example.com.", recordType: "A", content: "192.0.2.1", updatedBy: admin.email } });
    const inspection = await db.dnsInspection.create({ data: { recordId: record.id, inspectorId: admin.id, inspectorName: "Admin", inspectorEmail: admin.email, note: "", ...snapshot } });
    const updated = await PATCH(request("PATCH", { id: saved.id, expectedRevision: 1, event: { ...event, name: "Renamed" } }));
    expect(updated.status).toBe(200); expect((await updated.json()).event.revision).toBe(2);
    expect((await PATCH(request("PATCH", { id: saved.id, expectedRevision: 1, event }))).status).toBe(409);
    expect((await DELETE(request("DELETE", { id: saved.id, expectedRevision: 1 }))).status).toBe(409);
    expect((await DELETE(request("DELETE", { id: saved.id, expectedRevision: 2 }))).status).toBe(200);
    expect(await db.dnsInspection.findUnique({ where: { id: inspection.id } })).toMatchObject(snapshot);
    expect(await inspectionEventSnapshot(new Date("2040-10-04T00:00:00Z"))).toEqual({ eventId: null, eventName: null, eventClassified: true });
    expect(await db.auditLog.count({ where: { userId: admin.id, action: { startsWith: "INSPECTION_EVENT_" } } })).toBe(3);
  });
  it("serializes concurrent overlapping creates and accepts an adjacent period", async () => {
    const results = await Promise.allSettled([changeInspectionEvent(admin, { kind: "create", event }), changeInspectionEvent(admin, { kind: "create", event })]);
    const saved = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    ids.push(...saved.map((value) => value.id));
    expect(saved).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    await expect(changeInspectionEvent(admin, { kind: "create", event: { ...event, startsOn: "2040-10-31", endsOn: "2040-11-01" } })).rejects.toMatchObject({ status: 409 });
    const adjacent = await changeInspectionEvent(admin, { kind: "create", event: { ...event, startsOn: "2040-11-01", endsOn: "2040-11-02" } }); ids.push(adjacent!.id);
  });
  it("rejects revoked admin privileges even with a previously authenticated actor", async () => {
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "USER" } });
    await expect(changeInspectionEvent(admin, { kind: "create", event: { ...event, startsOn: "2041-01-01", endsOn: "2041-01-02" } })).rejects.toMatchObject({ status: 403 });
  });
  async function ownerAccount(): Promise<Actor> {
    const stored = await db.user.create({ data: {
      email: `${crypto.randomUUID()}@event-test.invalid`, globalRole: "USER", logtoName: OWNER_IDENTIFIER,
      accounts: { create: { provider: "logto", type: "oidc", providerAccountId: crypto.randomUUID() } },
    } });
    return { id: stored.id, email: stored.email, globalRole: "SUPER_ADMIN", portalIdentifier: OWNER_IDENTIFIER, zoneRoles: {} };
  }
  it("lets the verified Logto owner create, update and delete with a stored USER role", async () => {
    const owner = await ownerAccount();
    vi.mocked(requireActor).mockResolvedValue(owner);
    const ownerEvent = { ...event, startsOn: "2042-01-01", endsOn: "2042-01-02" };
    const created = await POST(request("POST", ownerEvent));
    expect(created.status).toBe(201);
    const saved = (await created.json()).event; ids.push(saved.id);
    const updated = await PATCH(request("PATCH", { id: saved.id, expectedRevision: 1, event: { ...ownerEvent, name: "Owner event" } }));
    expect(updated.status).toBe(200);
    expect((await updated.json()).event).toMatchObject({ name: "Owner event", revision: 2 });
    expect((await DELETE(request("DELETE", { id: saved.id, expectedRevision: 2 }))).status).toBe(200);
    expect(await db.user.findUnique({ where: { id: owner.id } })).toMatchObject({ globalRole: "USER" });
    expect(await db.auditLog.count({ where: { userId: owner.id, action: { startsWith: "INSPECTION_EVENT_" } } })).toBe(3);
  });
  it.each(["renamed", "unlinked", "disabled", "removed", "missing", "unverified-session"] as const)("rejects %s owner writes without changing events or recording success", async (reason) => {
    const owner = await ownerAccount();
    if (reason === "renamed") await db.user.update({ where: { id: owner.id }, data: { logtoName: "different-identifier" } });
    if (reason === "unlinked") await db.account.deleteMany({ where: { userId: owner.id } });
    if (reason === "disabled") await db.user.update({ where: { id: owner.id }, data: { disabled: true } });
    if (reason === "removed") await db.user.update({ where: { id: owner.id }, data: { removedAt: new Date() } });
    if (reason === "missing") await db.user.delete({ where: { id: owner.id } });
    if (reason === "unverified-session") owner.portalIdentifier = null;
    const saved = await db.inspectionEvent.create({ data: { name: "Unchanged", startsOn: new Date("2043-01-01"), endsOn: new Date("2043-01-02") } });
    ids.push(saved.id);
    for (const change of [
      { kind: "create" as const, event: { ...event, startsOn: "2044-01-01", endsOn: "2044-01-02" } },
      { kind: "update" as const, id: saved.id, expectedRevision: 1, event },
      { kind: "delete" as const, id: saved.id, expectedRevision: 1 },
    ]) await expect(changeInspectionEvent(owner, change)).rejects.toMatchObject({ status: 403 });
    expect(await db.inspectionEvent.findUnique({ where: { id: saved.id } })).toEqual(saved);
    expect(await db.inspectionEvent.count({ where: { startsOn: new Date("2044-01-01") } })).toBe(0);
    expect(await db.auditLog.count({ where: { userId: owner.id, action: { startsWith: "INSPECTION_EVENT_" } } })).toBe(0);
    await db.inspectionEvent.delete({ where: { id: saved.id } });
  });
});
