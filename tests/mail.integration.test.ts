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
import { enqueueDnsMail, enqueueReviewMail } from "@/lib/mail/queue";
import { changeInspectionEvent } from "@/lib/inspection-events/service";
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
    await db.mailDelivery.deleteMany(); await db.systemSetting.deleteMany({ where: { key: mailSettingsKey } }); await db.inspectionEvent.deleteMany();
    await db.securityRateLimit.deleteMany({ where: { key: { startsWith: "mail-actions:" } } });
    vi.mocked(requireActor).mockResolvedValue(actor);
    send.mockReset().mockImplementation(async ({ to, cc }) => ({ accepted: [...new Set([to, ...(cc ?? [])])] }));
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
  it("uses currently configured group recipients for CC and Reply-To on notifications and tests", async () => {
    const saved = await enable(); await enqueue();
    await POST(request({ action: "test", recipient: "test@example.com", expectedRevision: saved.revision }, "POST"));
    await saveMailSettings({ config: { ...config, fromEmail: "changed@example.com", recipients: ["group1@example.com", "group2@example.com"] }, expectedRevision: saved.revision }, actor);
    await processOneDelivery(); await processOneDelivery();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "team@example.com", cc: ["group1@example.com", "group2@example.com"], replyTo: ["group1@example.com", "group2@example.com"] }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "test@example.com", cc: ["group1@example.com", "group2@example.com"], replyTo: ["group1@example.com", "group2@example.com"] }));
    expect(await db.mailDelivery.count({ where: { status: "SENT" } })).toBe(2);
  });
  it("does not mark a message sent when only its To or CC was accepted", async () => {
    const saved = await enable();
    await POST(request({ action: "test", recipient: "test@example.com", expectedRevision: saved.revision }, "POST"));
    for (const accepted of [["team@example.com"], ["test@example.com"]]) {
      send.mockResolvedValueOnce({ accepted });
      await db.mailDelivery.updateMany({ data: { availableAt: new Date(0) } });
      await processOneDelivery();
      expect((await db.mailDelivery.findFirstOrThrow()).status).toBe("PENDING");
      expect((await db.mailDelivery.findFirstOrThrow()).lastError).toContain("副本");
    }
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
  async function scenarioConfig(patch: Partial<typeof config.templates>, extra: Partial<typeof config> = {}) {
    return saveMailSettings({ config: { ...config, ...extra, templates: { ...config.templates, ...patch } }, expectedRevision: (await readMailSettings()).revision }, actor);
  }
  async function unitWithAdmins() {
    const admin = await db.user.create({ data: { name: "管理員甲", email: `portal-${crypto.randomUUID()}@accounts.invalid`, portalEmail: `admin-${crypto.randomUUID()}@example.com` } });
    const hidden = await db.user.create({ data: { email: `portal-${crypto.randomUUID()}@accounts.invalid` } });
    const disabled = await db.user.create({ data: { email: `off-${crypto.randomUUID()}@example.com`, disabled: true } });
    const editor = await db.user.create({ data: { email: `editor-${crypto.randomUUID()}@example.com` } });
    const unit = await db.dnsUnit.create({ data: { name: `單位-${crypto.randomUUID()}`, members: { create: [{ userId: admin.id, role: "ADMIN" }, { userId: hidden.id, role: "ADMIN" }, { userId: disabled.id, role: "ADMIN" }, { userId: editor.id, role: "EDITOR" }] } } });
    return { unit, admin, editor };
  }
  it("upgrades stored single-template settings on read", async () => {
    const { templates: _templates, customTemplates: _custom, ...legacy } = config;
    void _templates; void _custom;
    await db.systemSetting.create({ data: { key: mailSettingsKey, value: { config: { ...legacy, subject: "Legacy {{unitName}}", body: "Legacy body {{operation}}" }, revision: crypto.randomUUID() } } });
    const settings = await readMailSettings();
    expect(settings.config.templates.requestDelete.subject).toBe("Legacy {{unitName}}");
    await enqueue();
    expect((await db.mailDelivery.findFirstOrThrow()).subject).toBe("Legacy Unit");
  });
  it("uses the operation's own template and skips scenarios that are switched off", async () => {
    await scenarioConfig({ requestDelete: { ...config.templates.requestDelete, subject: "刪除 {{unitName}}" }, requestUpdate: { ...config.templates.requestUpdate, enabled: false } });
    await db.$transaction(tx => enqueueDnsMail(tx, "delete", { ...event, operation: "刪除" }));
    await db.$transaction(tx => enqueueDnsMail(tx, "update", { ...event, operation: "修改" }));
    expect(await db.mailDelivery.findMany({ select: { eventKey: true, subject: true } })).toEqual([{ eventKey: "delete", subject: "刪除 Unit" }]);
  });
  it("notifies the applicant of review results without copying the team unless configured", async () => {
    const reviewed = { id: "req-1", operation: "CREATE", status: "REJECTED", recordName: "www.example.com.", recordType: "A", content: "192.0.2.1", reviewNote: "用途不明", reviewedAt: new Date(), applicantName: "申請人", applicantEmail: "applicant@example.com", applicantUnit: null, user: { name: "User", email: "u@accounts.invalid", portalEmail: null } };
    await enable();
    expect(await db.$transaction(tx => enqueueReviewMail(tx, reviewed, "資工系"))).toBe(0);
    await scenarioConfig({ reviewRejected: { ...config.templates.reviewRejected, enabled: true } });
    expect(await db.$transaction(tx => enqueueReviewMail(tx, reviewed, "資工系"))).toBe(1);
    expect(await db.$transaction(tx => enqueueReviewMail(tx, { ...reviewed, applicantEmail: null }, "資工系"))).toBe(0);
    const row = await db.mailDelivery.findFirstOrThrow();
    expect(row).toMatchObject({ eventKey: "dns-review:req-1", recipient: "applicant@example.com", ccTeam: false });
    expect(row.text).toContain("退回原因：用途不明");
    await processOneDelivery();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "applicant@example.com", cc: undefined, replyTo: ["team@example.com"] }));
    expect((await db.mailDelivery.findFirstOrThrow()).status).toBe("SENT");
  });
  it("notifies active unit administrators with deliverable addresses when an inspection event is created", async () => {
    const { unit, admin } = await unitWithAdmins();
    await scenarioConfig({ inspectionCreated: { ...config.templates.inspectionCreated, enabled: true, ccTeam: true } });
    await changeInspectionEvent(actor, { kind: "create", event: { name: "秋季清查", startsOn: "2026-11-01", endsOn: "2026-11-30" } });
    const rows = await db.mailDelivery.findMany({ where: { eventKey: { startsWith: "inspection:" } } });
    expect(rows.map(row => row.recipient)).toEqual([admin.portalEmail]);
    expect(rows[0]).toMatchObject({ ccTeam: true, eventKey: expect.stringMatching(new RegExp(`:${unit.id}$`)) });
    expect(rows[0].text).toContain("管理員甲"); expect(rows[0].text).toContain("2026-11-01");
  });
  it("sends a manual message to the selected units' administrators", async () => {
    const first = await unitWithAdmins(); const second = await unitWithAdmins();
    await enable();
    const listed = await (await GET()).json();
    expect(listed.units.find((unit: { id: string }) => unit.id === first.unit.id).admins).toEqual(expect.arrayContaining([{ name: "管理員甲", email: first.admin.portalEmail }, { name: "", email: null }]));
    const body = { action: "send", unitIds: [first.unit.id, second.unit.id], subject: "通知 {{unitName}}", body: "{{recipientName}} 您好 {{dnsUrl}}", ccTeam: false };
    const response = await POST(request(body, "POST"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ queued: 2 });
    const rows = await db.mailDelivery.findMany({ orderBy: { recipient: "asc" } });
    expect(rows.map(row => row.recipient).sort()).toEqual([first.admin.portalEmail, second.admin.portalEmail].sort());
    expect(rows.every(row => !row.ccTeam && row.eventKey.startsWith("manual:"))).toBe(true);
    expect(rows.find(row => row.recipient === first.admin.portalEmail)?.subject).toBe(`通知 ${first.unit.name}`);
    expect(rows[0].text).toContain("https://dns.example.com/dns");
    expect((await POST(request({ ...body, body: "{{reviewUrl}}" }, "POST"))).status).toBe(400);
    const empty = await db.dnsUnit.create({ data: { name: `空-${crypto.randomUUID()}` } });
    expect((await POST(request({ ...body, unitIds: [empty.id] }, "POST"))).status).toBe(400);
    expect(await db.auditLog.count({ where: { action: "SEND_UNIT_MAIL" } })).toBe(1);
  });
  it("tests a selected scenario or custom template with sample data", async () => {
    const custom = { id: "notice", name: "公告", subject: "公告 {{unitName}}", body: "{{recipientName}}" };
    const saved = await saveMailSettings({ config: { ...config, customTemplates: [custom] }, expectedRevision: null }, actor);
    expect((await POST(request({ action: "test", recipient: "t@example.com", template: "custom:notice", expectedRevision: saved.revision }, "POST"))).status).toBe(200);
    expect((await POST(request({ action: "test", recipient: "t2@example.com", template: "reviewApproved", expectedRevision: saved.revision }, "POST"))).status).toBe(200);
    expect((await POST(request({ action: "test", recipient: "t3@example.com", template: "custom:missing", expectedRevision: saved.revision }, "POST"))).status).toBe(404);
    const subject = async (recipient: string) => (await db.mailDelivery.findFirstOrThrow({ where: { recipient } })).subject;
    expect(await subject("t@example.com")).toBe("[測試] 公告 資訊工程學系"); expect(await subject("t2@example.com")).toContain("已核准");
  });
});
