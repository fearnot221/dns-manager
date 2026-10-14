import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
const isolated = vi.hoisted(() => {
  const schema = "mail_test_" + crypto.randomUUID().replaceAll("-", "");
  const target = new URL(process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused");
  target.searchParams.set("schema", schema);
  return { schema, url: target.href };
});
vi.mock("@/lib/db/client", async () => { const { PrismaClient } = await import("@prisma/client"); return { db: new PrismaClient({ datasourceUrl: isolated.url }) }; });
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => ({ PDNS_MOCK: "true" }) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn() } }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));
import nodemailer from "nodemailer";
import { db } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { GET, POST, PUT } from "@/app/api/admin/mail/route";
import { defaultMailConfig } from "@/lib/mail/model";
import { mailSettingsKey, readMailSettings, saveMailSettings } from "@/lib/mail/settings";
import { enqueueDnsMail } from "@/lib/mail/queue";
import { claimDelivery, processOneDelivery } from "@/lib/mail/worker";
import { saveApplication } from "@/lib/requests/save-application";
import { requestUnitChange } from "@/lib/units/records";
import { powerdns } from "@/lib/powerdns/client";
import { recordId } from "@/lib/inventory/service";
import { rrsetHash } from "@/lib/dns/rrset";
import type { RRSet, Zone } from "@/lib/dns/types";
import type { Actor } from "@/lib/dns/types";
const url = process.env.UNIT_TEST_DATABASE_URL;
let actor: Actor;
const config = { ...defaultMailConfig, enabled: true, fromEmail: "sender@example.com", recipients: ["team@example.com"] };
const event = { applicationId: "application-1", applicantName: "Applicant", unitName: "Unit", recordCount: "10", operation: "新增" };
const request = (body: unknown, method = "PUT", origin = "https://dns.example.com") => new Request("http://localhost/api/admin/mail", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const send = vi.fn();
async function enable() { return saveMailSettings({ config, expectedRevision: null }, actor); }
async function enqueue(key = "dns:test") { await db.$transaction(tx => enqueueDnsMail(tx, key, event)); }

describe.skipIf(!url)("mail settings and delivery in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(url!); if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/dns_units_test") throw Error("Use isolated DB only");
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: isolated.url }, stdio: "pipe" });
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("AUTH_URL", "https://dns.example.com");
    const user = await db.user.create({ data: { email: `mail-${crypto.randomUUID()}@example.com`, globalRole: "ADMIN" } });
    actor = { id: user.id, email: user.email, globalRole: "ADMIN", zoneRoles: {} };
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.mailDelivery.deleteMany(); await db.systemSetting.deleteMany({ where: { key: mailSettingsKey } });
    await db.securityRateLimit.deleteMany({ where: { key: { startsWith: "mail-actions:" } } });
    vi.mocked(requireActor).mockResolvedValue(actor);
    send.mockReset().mockResolvedValue({ accepted: ["team@example.com"] });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: send, close: vi.fn() } as never);
  });
  afterAll(async () => {
    await db.mailDelivery.deleteMany(); await db.systemSetting.deleteMany({ where: { key: mailSettingsKey } });
    await db.$executeRawUnsafe(`DROP SCHEMA "${isolated.schema}" CASCADE`);
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("blocks unauthenticated, ordinary and delegated admins, plus cross-origin writes", async () => {
    for (const zoneRoles of [{}, { "example.com.": "ADMIN" }] as Actor["zoneRoles"][]) {
      vi.mocked(requireActor).mockResolvedValue({ ...actor, globalRole: "USER", zoneRoles });
      expect((await GET()).status).toBe(403);
      expect((await PUT(request({}))).status).toBe(403);
      expect((await POST(request({ action: "test" }, "POST"))).status).toBe(403);
    }
    vi.mocked(requireActor).mockResolvedValue(actor);
    expect((await PUT(request({}, "PUT", "https://evil.example"))).status).toBe(403);
    expect((await POST(request({}, "POST", "https://evil.example"))).status).toBe(403);
    const { AuthError } = await import("@/lib/auth/session");
    vi.mocked(requireActor).mockRejectedValue(new AuthError());
    expect((await GET()).status).toBe(401);
    expect(await db.systemSetting.findUnique({ where: { key: mailSettingsKey } })).toBeNull();
  });
  it("saves relay settings, rejects stale writes and rejects credential fields", async () => {
    const saved = await enable();
    expect((await readMailSettings()).config.host).toBe("smtp-relay.gmail.com");
    expect(await (await GET()).text()).not.toContain("encryptedPassword");
    await saveMailSettings({ config, expectedRevision: saved.revision }, actor);
    await expect(saveMailSettings({ config, expectedRevision: saved.revision }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await PUT(request({ config, password: "abcdefghijklmnop", expectedRevision: saved.revision }))).status).toBe(400);
  });
  it("sends tests through relay with no auth and no encryption key", async () => {
    const saved = await enable();
    expect((await POST(request({ action: "test", recipient: "test@example.com", expectedRevision: saved.revision }, "POST"))).status).toBe(200);
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");
    expect(await processOneDelivery()).toBe(true);
    const options = vi.mocked(nodemailer.createTransport).mock.calls[0][0];
    expect(options).toMatchObject({ host: "smtp-relay.gmail.com", port: 587, secure: false, requireTLS: true });
    expect(options).not.toHaveProperty("auth");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await db.mailDelivery.findFirstOrThrow()).status).toBe("SENT");
  });
  it("deduplicates batch notification and rolls it back with its enclosing transaction", async () => {
    await enqueue(); expect(await db.mailDelivery.count()).toBe(0);
    await enable();
    await expect(db.$transaction(async tx => { await enqueueDnsMail(tx, "rollback", event); throw Error("rollback"); })).rejects.toThrow("rollback");
    expect(await db.mailDelivery.count()).toBe(0);
    await enqueue(); await enqueue();
    expect(await db.mailDelivery.count()).toBe(1);
    expect((await db.mailDelivery.findFirstOrThrow()).text).toContain("10");
  });
  it("creates one notification for a new batch and for each update/delete request", async () => {
    await enable();
    const unit = await db.dnsUnit.create({ data: { name: crypto.randomUUID(), members: { create: { userId: actor.id, role: "EDITOR" } } } });
    const zone: Zone = { id: "example.com.", name: "example.com.", kind: "Native", serial: 1, dnssec: false, rrsets: [] as RRSet[] };
    vi.mocked(powerdns.getZone).mockImplementation(async () => structuredClone(zone));
    const input = { unitId: unit.id, applicantName: "Contact", applicantEmail: "contact@example.com", applicantExtension: "123", applicantUnit: "forged", records: [0, 1].map(i => ({ zoneName: zone.name, recordName: `new-${i}.example.com.`, recordType: "A", content: "192.0.2.1", ttl: 300, purpose: "test" })) };
    const batch = await saveApplication(actor, input, request({}));
    expect(await db.mailDelivery.count()).toBe(1);
    expect((await db.mailDelivery.findFirstOrThrow()).eventKey).toBe(`dns-request:${batch.applicationId}`);
    expect((await db.mailDelivery.findFirstOrThrow()).text).toContain("紀錄筆數：2");
    for (const operation of ["UPDATE", "DELETE"] as const) {
      const source = { zoneName: zone.name, recordName: `${operation.toLowerCase()}.example.com.`, recordType: "A", content: "192.0.2.1" };
      const id = recordId("local-mock", source);
      await db.dnsRecordMetadata.create({ data: { ...source, id, unitId: unit.id, updatedBy: actor.email } });
      zone.rrsets = [{ name: source.recordName, type: "A", ttl: 300, records: [{ content: source.content, disabled: false }] }];
      const saved = await requestUnitChange(actor, unit.id, { operation, recordId: id, content: "192.0.2.2", expectedHash: rrsetHash(zone.rrsets[0]), purpose: "test" });
      expect(await db.mailDelivery.count({ where: { eventKey: `dns-request:${saved.id}` } })).toBe(1);
    }
    expect(await db.mailDelivery.count()).toBe(3);
    expect(send).not.toHaveBeenCalled();
  });
  it("claims concurrently without double ownership and recovers an expired lease", async () => {
    await enable(); await enqueue();
    const results = await Promise.all([claimDelivery(), claimDelivery()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const first = results.find(Boolean)!;
    await db.mailDelivery.update({ where: { id: first.id }, data: { leaseUntil: new Date(0) } });
    const second = await claimDelivery();
    expect(second?.id).toBe(first.id); expect(second?.leaseToken).not.toBe(first.leaseToken);
    expect(second?.attempts).toBe(2);
  });
  it("uses TLS, records SMTP acceptance and does not send a successful job twice", async () => {
    await enable(); await enqueue();
    expect(await processOneDelivery()).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp-relay.gmail.com", secure: false, requireTLS: true, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true } }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "team@example.com", text: expect.stringContaining("https://dns.example.com/requests") }));
    expect((await db.mailDelivery.findFirstOrThrow()).status).toBe("SENT");
    expect(await processOneDelivery()).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  });
  it("pauses disabled mail and applies bounded retries with redacted errors", async () => {
    const saved = await enable(); await enqueue();
    const paused = await saveMailSettings({ config: { ...config, enabled: false }, expectedRevision: saved.revision }, actor);
    expect(await processOneDelivery()).toBe(false); expect(send).not.toHaveBeenCalled();
    await saveMailSettings({ config, expectedRevision: paused.revision }, actor);
    send.mockRejectedValue({ code: "EAUTH", message: "abcdefghijklmnop" });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.mailDelivery.updateMany({ data: { availableAt: new Date(0) } });
      await processOneDelivery();
      const row = await db.mailDelivery.findFirstOrThrow();
      expect(row.attempts).toBe(attempt); expect(row.lastError).not.toContain("abcdefghijklmnop");
      expect(row.status).toBe(attempt === 5 ? "FAILED" : "PENDING");
      expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
    }
    expect(await processOneDelivery()).toBe(false);
  });
  it("queues tests only to an explicit recipient and permits retries only for failed deliveries", async () => {
    const saved = await enable();
    expect((await POST(request({ action: "test", recipient: "test@example.com", expectedRevision: saved.revision }, "POST"))).status).toBe(200);
    const row = await db.mailDelivery.findFirstOrThrow(); expect(row.recipient).toBe("test@example.com"); expect(send).not.toHaveBeenCalled();
    expect((await POST(request({ action: "retry", id: row.id }, "POST"))).status).toBe(409);
    await db.mailDelivery.update({ where: { id: row.id }, data: { status: "FAILED", attempts: 5 } });
    expect((await POST(request({ action: "retry", id: row.id }, "POST"))).status).toBe(200);
    expect((await db.mailDelivery.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(0);
  });
});
