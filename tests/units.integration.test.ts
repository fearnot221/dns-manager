/** Opt-in: UNIT_TEST_DATABASE_URL must point at a disposable local dns_units_test DB. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ AuthError: class extends Error {} }));
vi.mock("@/lib/db/client", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasourceUrl: process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused" }) };
});
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => ({ PDNS_MOCK: "true" }) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn(), replaceRRSet: vi.fn() } }));
import { db } from "@/lib/db/client";
import { powerdns } from "@/lib/powerdns/client";
import { createUnit, joinUnit, listUnits, manageUnit, unitAccess } from "@/lib/units/service";
import { requestUnitChange, unitDetail } from "@/lib/units/records";
import { reviewUnitRequest } from "@/lib/units/review";
import { saveApplication } from "@/lib/requests/save-application";
import { recordId } from "@/lib/inventory/service";
import type { Actor, Zone } from "@/lib/dns/types";
import { rrsetHash } from "@/lib/dns/rrset";
import { sendContact, replyContact, assignInspection, respondInspection, cancelInspection } from "@/lib/workflows/service";
import { removeUser } from "@/lib/users/remove";
import { assertApplicationPolicy, saveApplicationPolicy, readApplicationPolicy } from "@/lib/requests/policy";

const url = process.env.UNIT_TEST_DATABASE_URL;
let zone: Zone;
let creator: Actor, viewer: Actor, editor: Actor, outsider: Actor, admin: Actor;
let unitId: string, code: string;
const httpRequest = () => new Request("http://localhost/api/dns-requests", { method: "POST" });
async function account(role: "USER" | "ADMIN" = "USER"): Promise<Actor> {
  const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@unit-test.invalid`, globalRole: role, studentId: String(Math.floor(Math.random() * 1000000000)) } });
  return { id: user.id, email: user.email, globalRole: role, zoneRoles: {} };
}
async function sourceRecord() {
  const source = { zoneName: zone.name, recordName: `${unitId}.example.com.`, recordType: "A", content: "192.0.2.1" };
  const id = recordId("local-mock", source);
  await db.dnsRecordMetadata.upsert({ where: { id }, create: { ...source, id, unitId, updatedBy: admin.email }, update: { unitId } });
  zone.rrsets = [{ name: source.recordName, type: "A", ttl: 300, records: [{ content: source.content, disabled: false }, { content: "192.0.2.99", disabled: false }], comments: [{ content: "preserve" }] }];
  return { id, expectedHash: rrsetHash(zone.rrsets[0]) };
}
const changeInput = (source: { id: string; expectedHash: string }) => ({ recordId: source.id, expectedHash: source.expectedHash, content: "192.0.2.10", purpose: "服務搬遷" });

describe.skipIf(!url)("units with real PostgreSQL and isolated fake PowerDNS", () => {
  beforeAll(() => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/dns_units_test") throw new Error("Use a disposable localhost dns_units_test database only");
    vi.stubEnv("DATABASE_URL", url!);
  });
  afterAll(async () => { await db.$disconnect(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.systemSetting.deleteMany({ where: { key: "dns-application-policy" } });
    zone = { id: "example.com.", name: "example.com.", kind: "Native", serial: 1, dnssec: false, rrsets: [] };
    vi.mocked(powerdns.getZone).mockImplementation(async () => structuredClone(zone));
    vi.mocked(powerdns.replaceRRSet).mockImplementation(async (_name, rrset) => { zone.rrsets = [structuredClone(rrset)]; });
    [creator, viewer, editor, outsider, admin] = await Promise.all([account(), account(), account(), account(), account("ADMIN")]);
    const created = await createUnit(creator, `test-${crypto.randomUUID()}`);
    unitId = created.unit.id; code = created.passcode;
    await joinUnit(viewer, code); await joinUnit(editor, code);
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "EDITOR" });
  });
  it("creates an admin, joins as viewer, stores no plaintext code and hides outsider units", async () => {
    expect(await unitAccess(creator, unitId, "manage")).toBe("ADMIN");
    expect(await unitAccess(viewer, unitId, "view")).toBe("VIEWER");
    expect(await listUnits(outsider)).toEqual([]);
    expect(JSON.stringify(await listUnits(viewer))).not.toContain(code);
    expect((await db.dnsUnit.findUniqueOrThrow({ where: { id: unitId } })).passcodeHash).not.toBe(code);
    expect(await db.auditLog.count({ where: { newValue: { path: ["passcode"], equals: code } } })).toBe(0);
  });
  it("enforces type and membership rules in application services and detects stale policy edits", async () => {
    const saved = await saveApplicationPolicy({ allowedTypes: ["A"], ownership: "MEMBERS_ONLY" }, null);
    await expect(assertApplicationPolicy(outsider, ["A"])).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["AAAA"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["A"], unitId)).resolves.toBeUndefined();
    await expect(saveApplicationPolicy({ allowedTypes: [], ownership: "ANY" }, null)).rejects.toMatchObject({ status: 409 });
    expect((await readApplicationPolicy()).updatedAt).toBe(saved.after.updatedAt);
    const source = await sourceRecord();
    await saveApplicationPolicy({ allowedTypes: [], ownership: "ANY" }, saved.after.updatedAt);
    await expect(requestUnitChange(editor, unitId, changeInput(source))).rejects.toMatchObject({ status: 403 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("stores messages and audited administrator replies without allowing a user to reply", async () => {
    const message = await sendContact(viewer, { subject: "問題", body: "DNS 用途需要確認" });
    await expect(replyContact(outsider, message.id, "偽造回覆")).rejects.toMatchObject({ status: 403 });
    await replyContact(admin, message.id, "已收到");
    await expect(replyContact(admin, message.id, "再次回覆")).rejects.toMatchObject({ status: 409 });
    expect((await db.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).repliedBy).toBe(admin.id);
    expect(await db.auditLog.count({ where: { userId: admin.id, action: "REPLY_CONTACT_MESSAGE" } })).toBe(1);
  });
  it("only permits the assigned user to confirm a live DNS once, with an authenticated inspector", async () => {
    const source = await sourceRecord();
    const identity = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    await expect(assignInspection(viewer, identity, viewer.id)).rejects.toMatchObject({ status: 403 });
    const task = await assignInspection(admin, identity, viewer.id);
    await expect(assignInspection(admin, identity, viewer.id)).rejects.toMatchObject({ code: "P2002" });
    await expect(respondInspection(outsider, task.id, "CONFIRMED", "")).rejects.toMatchObject({ status: 404 });
    await respondInspection(viewer, task.id, "CONFIRMED", "仍使用");
    await expect(respondInspection(viewer, task.id, "CONFIRMED", "")).rejects.toMatchObject({ status: 404 });
    expect((await db.dnsInspection.findFirstOrThrow({ where: { recordId: source.id } })).inspectorId).toBe(viewer.id);
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("rejects stale DNS confirmation and lets an admin withdraw and reassign", async () => {
    const source = await sourceRecord();
    const identity = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const task = await assignInspection(admin, identity, viewer.id);
    zone.rrsets = [];
    await expect(respondInspection(viewer, task.id, "CONFIRMED", "")).rejects.toMatchObject({ status: 409 });
    await expect(cancelInspection(viewer, task.id)).rejects.toMatchObject({ status: 403 });
    await cancelInspection(admin, task.id);
    expect((await db.inspectionTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("CANCELLED");
  });
  it("restricts account removal and preserves the last unit administrator", async () => {
    const owner = { ...admin, globalRole: "SUPER_ADMIN" as const, portalIdentifier: "115502532" };
    await expect(removeUser(admin, viewer.id)).rejects.toMatchObject({ status: 403 });
    await expect(removeUser(owner, owner.id)).rejects.toMatchObject({ status: 403 });
    await expect(removeUser(owner, creator.id)).rejects.toMatchObject({ status: 409 });
    await expect(removeUser(owner, viewer.id)).resolves.toBeUndefined();
    const removed = await db.user.findUniqueOrThrow({ where: { id: viewer.id } });
    expect(removed.disabled).toBe(true); expect(removed.removedAt).toBeTruthy();
    expect(await db.unitMember.count({ where: { userId: viewer.id } })).toBe(0);
    await expect(joinUnit(viewer, code)).rejects.toMatchObject({ status: 403 });
    await expect(joinUnit(outsider, code)).rejects.toMatchObject({ status: 400 });
    await expect(assignInspection(admin, { zoneName: zone.name, recordName: "x", recordType: "A", content: "1" }, viewer.id)).rejects.toBeTruthy();
  });
  it("blocks viewer/outsider membership changes and never upgrades a duplicate join", async () => {
    await expect(manageUnit(viewer, unitId, { action: "rotate" })).rejects.toMatchObject({ status: 403 });
    await expect(manageUnit(outsider, unitId, { action: "member", userId: viewer.id, role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
    await joinUnit(editor, code);
    expect(await unitAccess(editor, unitId, "edit")).toBe("EDITOR");
    await expect(unitDetail(outsider, unitId)).rejects.toMatchObject({ status: 403 });
  });
  it("keeps membership management available when PowerDNS is unavailable", async () => {
    await sourceRecord();
    vi.mocked(powerdns.getZone).mockRejectedValue(new Error("offline"));
    const detail = await unitDetail(creator, unitId);
    expect(detail.recordsError).toContain("清單可能不完整");
    expect(detail.members).toHaveLength(3);
    expect(detail.records).toEqual([]);
  });
  it("rotates invitations and invalidates distributed codes on removal", async () => {
    const rotated = await manageUnit(creator, unitId, { action: "rotate" });
    await expect(joinUnit(outsider, code)).rejects.toMatchObject({ status: 400 });
    const next = ("passcode" in rotated ? rotated.passcode : "") ?? "";
    await joinUnit(outsider, next);
    await manageUnit(creator, unitId, { action: "member", userId: outsider.id, role: null });
    await expect(joinUnit(outsider, next)).rejects.toMatchObject({ status: 400 });
    await expect(unitAccess(outsider, unitId, "view")).rejects.toMatchObject({ status: 403 });
  });
  it("serializes concurrent demotions and preserves one administrator", async () => {
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "ADMIN" });
    const results = await Promise.allSettled([
      manageUnit(admin, unitId, { action: "member", userId: creator.id, role: "VIEWER" }),
      manageUnit(admin, unitId, { action: "member", userId: editor.id, role: "VIEWER" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.unitMember.count({ where: { unitId, role: "ADMIN" } })).toBe(1);
  });
  it("rejects viewer and cross-unit change submissions without touching DNS", async () => {
    const source = await sourceRecord();
    await expect(requestUnitChange(viewer, unitId, changeInput(source))).rejects.toMatchObject({ status: 403 });
    const other = await createUnit(editor, `other-${crypto.randomUUID()}`);
    await expect(requestUnitChange(editor, other.unit.id, changeInput(source))).rejects.toMatchObject({ status: 404 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("requires system admin review and changes only the approved value", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    await expect(reviewUnitRequest(creator, pending.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    await expect(reviewUnitRequest({ ...creator, zoneRoles: { [zone.name]: "ADMIN" } }, pending.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    await reviewUnitRequest(admin, pending.id, "APPROVE");
    expect(zone.rrsets[0].records.map((record) => record.content)).toEqual(["192.0.2.10", "192.0.2.99"]);
    expect(zone.rrsets[0].comments).toEqual([{ content: "preserve" }]);
    const detail = await unitDetail(viewer, unitId);
    expect(detail.records.map((record) => record.content)).toEqual(["192.0.2.10"]);
    expect(JSON.stringify(detail)).not.toContain("192.0.2.99");
    expect(JSON.stringify(detail)).not.toContain(editor.email);
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 409 });
  });
  it("prevents duplicate pending changes even with concurrent requests", async () => {
    const source = await sourceRecord();
    const results = await Promise.allSettled([requestUnitChange(editor, unitId, changeInput(source)), requestUnitChange(editor, unitId, changeInput(source))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    await db.dnsRecordRequest.updateMany({ where: { sourceRecordId: source.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  });
  it("serializes concurrent approvals and publishes only once", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    const results = await Promise.allSettled([reviewUnitRequest(admin, pending.id, "APPROVE"), reviewUnitRequest(admin, pending.id, "APPROVE")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(powerdns.replaceRRSet).toHaveBeenCalledOnce();
  });
  it("blocks stale DNS approval and lets an administrator reject it", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    zone.rrsets[0].ttl = 600;
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 409 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect((await reviewUnitRequest(admin, pending.id, "REJECT", "DNS 已更新，請重新申請")).status).toBe("REJECTED");
  });
  it("rechecks membership on approval after demotion", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "VIEWER" });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 409 });
    await reviewUnitRequest(admin, pending.id, "REJECT");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("recovers a DNS-applied / DB-not-yet-saved change without repeating the DNS write", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    zone.rrsets[0].records[0].content = "192.0.2.10";
    await reviewUnitRequest(admin, pending.id, "APPROVE");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect((await unitDetail(viewer, unitId)).records[0].content).toBe("192.0.2.10");
  });
  it("creates shared DNS only after review; multiple values may be reviewed in any order", async () => {
    const input = { unitId, applicantName: "測試", applicantUnit: "forged display name", applicantExtension: "1234", records: ["192.0.2.40", "192.0.2.41"].map((content) => ({ zoneName: zone.name, recordName: `new-${crypto.randomUUID().slice(0, 8)}.example.com.`, recordType: "A", content, ttl: 300, purpose: "unit application" })) };
    input.records[1].recordName = input.records[0].recordName;
    await expect(saveApplication(viewer, input, httpRequest())).rejects.toMatchObject({ status: 403 });
    const saved = await saveApplication(editor, input, httpRequest());
    const requests = await db.dnsRecordRequest.findMany({ where: { applicationId: saved.applicationId } });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect(requests[0].applicantUnit).not.toBe("forged display name");
    for (const request of requests.reverse()) await reviewUnitRequest(admin, request.id, "APPROVE");
    expect((await unitDetail(viewer, unitId)).records).toHaveLength(2);
  });
});
