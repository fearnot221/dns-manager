/** Opt-in: UNIT_TEST_DATABASE_URL must point at a disposable local dns_units_test DB. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/db/client", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasourceUrl: process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused" }) };
});
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => ({ PDNS_MOCK: "true" }) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn(), replaceRRSet: vi.fn() } }));
import { requireActor } from "@/lib/auth/session";
import { PATCH as patchUser } from "@/app/api/users/[id]/route";
import { manageAllowlist } from "@/lib/units/allowlist";
import { enrollAllowlistedUser } from "@/lib/units/enroll";
import { deleteInspection } from "@/lib/inventory/inspections";
import { assignRecordUnit } from "@/lib/inventory/assignment";
import { describeRecords, saveInventory } from "@/lib/inventory/service";
import { memberWorkspaces } from "@/lib/units/workspace";
import { db } from "@/lib/db/client";
import { powerdns } from "@/lib/powerdns/client";
import { createUnit, listUnits, manageUnit, unitAccess, reviewUnit, assignUnitManager } from "@/lib/units/service";
import { requestUnitChange, unitDetail } from "@/lib/units/records";
import { reviewUnitRequest } from "@/lib/units/review";
import { saveApplication } from "@/lib/requests/save-application";
import { recordId } from "@/lib/inventory/service";
import type { Actor, Zone } from "@/lib/dns/types";
import { rrsetHash } from "@/lib/dns/rrset";
import { removeUser } from "@/lib/users/remove";
import { assertApplicationPolicy, saveApplicationPolicy, readApplicationPolicy } from "@/lib/requests/policy";

const url = process.env.UNIT_TEST_DATABASE_URL;
let zone: Zone;
let creator: Actor, viewer: Actor, editor: Actor, outsider: Actor, admin: Actor;
let unitId: string;
const httpRequest = () => new Request("http://localhost/api/dns-requests", { method: "POST" });
async function account(role: "USER" | "ADMIN" = "USER"): Promise<Actor> {
  const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@unit-test.invalid`, globalRole: role, studentId: crypto.randomUUID() } });
  return { id: user.id, studentId: user.studentId, email: user.email, globalRole: role, zoneRoles: {} };
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
    const created = await createUnit(admin, `test-${crypto.randomUUID()}`, creator.studentId!);
    unitId = created.unit.id;
    await manageAllowlist(creator, unitId, viewer.studentId!);
    await manageAllowlist(creator, unitId, editor.studentId!);
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "EDITOR" });
  });
  it("lets a system admin update another admin role while protecting the verified owner", async () => {
    vi.mocked(requireActor).mockResolvedValue(admin);
    const patch = (id: string, body: unknown) => patchUser(new Request("http://localhost/api/users/" + id, { method: "PATCH", headers: { Origin: "http://localhost" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    expect((await patch(outsider.id, { globalRole: "ADMIN" })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).globalRole).toBe("ADMIN");
    expect((await patch(outsider.id, { globalRole: "USER" })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).globalRole).toBe("USER");
    await db.user.update({ where: { id: outsider.id }, data: { globalRole: "SUPER_ADMIN", logtoName: "115502532" } });
    await db.account.create({ data: { userId: outsider.id, type: "oauth", provider: "logto", providerAccountId: crypto.randomUUID() } });
    for (const input of [{ globalRole: "USER" }, { disabled: true }]) expect((await patch(outsider.id, input)).status).toBe(403);
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).globalRole).toBe("SUPER_ADMIN");
    expect((await patch(viewer.id, { globalRole: "SUPER_ADMIN" })).status).toBe(400);
  });
  it("atomically saves ownership and inspection while preserving the assigned unit and existing history", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const old = await db.dnsInspection.create({ data: { recordId: source.id, inspectorId: admin.id, inspectorName: "Admin", inspectorEmail: admin.email, note: "previous" } });
    const input = { ...before, mode: "inspect-and-metadata" as const, expectedUpdatedAt: before.updatedAt.toISOString(), applicantName: "Updated", purpose: "updated purpose", note: "confirmed" };
    await saveInventory(admin, input);
    const after = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id }, include: { inspections: true } });
    expect(after).toMatchObject({ unitId, applicantName: "Updated", purpose: "updated purpose", content: before.content });
    expect(after.inspections).toHaveLength(2);
    expect(after.inspections).toEqual(expect.arrayContaining([expect.objectContaining({ id: old.id }), expect.objectContaining({ note: "confirmed", inspectorId: admin.id })]));
    await expect(saveInventory(admin, { ...input, purpose: "stale" })).rejects.toMatchObject({ status: 409 });
    expect(await db.dnsInspection.count({ where: { recordId: source.id } })).toBe(2);
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).purpose).toBe("updated purpose");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("deletes only the selected inspection and audits its snapshot without changing DNS or ownership", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const data = { recordId: source.id, inspectorId: admin.id, inspectorName: "Admin", inspectorEmail: admin.email, note: "original" };
    const first = await db.dnsInspection.create({ data });
    const second = await db.dnsInspection.create({ data });
    const owner = { ...admin, globalRole: "SUPER_ADMIN" as const, portalIdentifier: "115502532" };
    const input = { recordId: source.id, expectedUpdatedAt: before.updatedAt.toISOString() };
    for (const actor of [admin, creator, viewer, { ...owner, portalIdentifier: null }, { ...outsider, zoneRoles: { [zone.name]: "ADMIN" as const } }]) await expect(deleteInspection(actor, first.id, input)).rejects.toMatchObject({ status: 403 });
    await expect(deleteInspection(owner, first.id, { ...input, recordId: "f".repeat(64) })).rejects.toMatchObject({ status: 404 });
    await expect(deleteInspection(owner, first.id, { ...input, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })).rejects.toMatchObject({ status: 409 });
    await deleteInspection(owner, first.id, input);
    const after = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id }, include: { inspections: true } });
    expect(after).toMatchObject({ unitId: before.unitId, content: before.content, purpose: before.purpose });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.inspections.map((item) => item.id)).toEqual([second.id]);
    expect(await db.auditLog.findFirst({ where: { action: "DELETE_DNS_INSPECTION", userId: admin.id } })).toMatchObject({ oldValue: { id: first.id, note: "original" }, success: true });
    await expect(deleteInspection(owner, first.id, input)).rejects.toMatchObject({ status: 404 });
    await expect(deleteInspection(owner, second.id, input)).rejects.toMatchObject({ status: 409 });
    expect(powerdns.getZone).not.toHaveBeenCalled(); expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("rejects deletion by disabled owners and serializes duplicate deletions", async () => {
    const source = await sourceRecord();
    const record = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const inspection = await db.dnsInspection.create({ data: { recordId: source.id, inspectorId: admin.id, inspectorName: "Admin", inspectorEmail: admin.email, note: "" } });
    const owner = { ...admin, globalRole: "SUPER_ADMIN" as const, portalIdentifier: "115502532" };
    const input = { recordId: source.id, expectedUpdatedAt: record.updatedAt.toISOString() };
    await db.user.update({ where: { id: admin.id }, data: { disabled: true } });
    await expect(deleteInspection(owner, inspection.id, input)).rejects.toMatchObject({ status: 403 });
    expect(await db.dnsInspection.count({ where: { id: inspection.id } })).toBe(1);
    await db.user.update({ where: { id: admin.id }, data: { disabled: false } });
    const results = await Promise.allSettled([deleteInspection(owner, inspection.id, input), deleteInspection(owner, inspection.id, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "DELETE_DNS_INSPECTION", userId: admin.id } })).toBe(1);
  });
  it("uses actual memberships for workspaces and restricts management data without calling DNS", async () => {
    expect((await memberWorkspaces(creator)).map((unit) => unit.id)).toEqual([unitId]);
    expect(await memberWorkspaces(admin)).toEqual([]);
    expect(await memberWorkspaces(outsider)).toEqual([]);
    await sourceRecord();
    await expect(unitDetail(viewer, unitId, "manage")).rejects.toMatchObject({ status: 403 });
    await expect(unitDetail(editor, unitId, "manage")).rejects.toMatchObject({ status: 403 });
    expect((await unitDetail(creator, unitId, "manage")).members).toHaveLength(3);
    expect((await unitDetail(admin, unitId, "manage")).allowlist).toHaveLength(3);
    expect(powerdns.getZone).toHaveBeenCalledWith(zone.name);
    expect((await unitDetail(admin, unitId, "manage")).records.map((record) => record.content)).toEqual(["192.0.2.1"]);
    vi.mocked(powerdns.getZone).mockRejectedValueOnce(new Error("offline"));
    const unavailable = await unitDetail(admin, unitId, "manage");
    expect(unavailable.members).toHaveLength(3); expect(unavailable.recordsError).toContain("暫時無法取得");
  });
  it("assigns a live DNS value to a unit while preserving history, neighboring records and DNS", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { applicantName: "原申請人", purpose: "原用途" } });
    const inspection = await db.dnsInspection.create({ data: { recordId: source.id, inspectorId: admin.id, inspectorName: "Admin", inspectorEmail: admin.email, note: "原清查" } });
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    const target = await createUnit(admin, `assigned-${crypto.randomUUID()}`, outsider.studentId!);
    const rrsets = structuredClone(zone.rrsets);
    await assignRecordUnit(admin, { ...before, expectedUpdatedAt: before.updatedAt.toISOString(), unitId: target.unit.id });
    const after = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id }, include: { inspections: true } });
    expect(after).toMatchObject({ unitId: target.unit.id, applicantUnit: target.unit.name, applicantName: "原申請人", purpose: "原用途" });
    expect(after.inspections.map((item) => item.id)).toEqual([inspection.id]);
    expect((await unitDetail(editor, unitId)).records).toEqual([]);
    expect((await unitDetail(outsider, target.unit.id)).records.map((item) => item.content)).toEqual(["192.0.2.1"]);
    expect((await describeRecords(admin, zone.name, zone.rrsets))[0].ownership).toMatchObject({ unitId: target.unit.id, unitName: target.unit.name });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 409 });
    expect(zone.rrsets).toEqual(rrsets); expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect(await db.inspectionTask.count({ where: { recordId: source.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "ASSIGN_DNS_UNIT", userId: admin.id } })).toBe(1);
  });
  it("creates ownership for an unassigned value and rejects stale reassignment", async () => {
    await sourceRecord();
    const identity = { zoneName: zone.name, recordName: zone.rrsets[0].name, recordType: "A", content: "192.0.2.99" };
    const input = { ...identity, id: recordId("local-mock", identity), expectedUpdatedAt: null, unitId };
    await assignRecordUnit(admin, input);
    expect((await unitDetail(viewer, unitId)).records).toHaveLength(2);
    await expect(assignRecordUnit(admin, input)).rejects.toMatchObject({ status: 409 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("blocks unauthorized assignment, inactive targets, stale connections and missing DNS values", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const input = { ...before, expectedUpdatedAt: before.updatedAt.toISOString(), unitId };
    for (const actor of [creator, editor, viewer, { ...outsider, zoneRoles: { [zone.name]: "ADMIN" as const } }]) await expect(assignRecordUnit(actor, input)).rejects.toMatchObject({ status: 403 });
    await expect(assignRecordUnit(admin, { ...input, unitId: "missing" })).rejects.toMatchObject({ status: 404 });
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await expect(assignRecordUnit(admin, input)).rejects.toMatchObject({ status: 403 });
    await reviewUnit(admin, unitId, "APPROVE");
    await expect(assignRecordUnit(admin, { ...input, id: recordId("other-connection", input), expectedUpdatedAt: null })).rejects.toMatchObject({ status: 409 });
    await expect(assignRecordUnit(admin, { ...input, zoneName: "2.0.192.in-addr.arpa." })).rejects.toMatchObject({ status: 400 });
    zone.rrsets = [];
    await expect(assignRecordUnit(admin, input)).rejects.toMatchObject({ status: 409 });
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).updatedAt).toEqual(before.updatedAt);
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("serializes competing unit assignments so only one can use the displayed version", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const first = await createUnit(admin, `first-${crypto.randomUUID()}`, outsider.studentId!);
    const second = await createUnit(admin, `second-${crypto.randomUUID()}`, outsider.studentId!);
    const results = await Promise.allSettled([first, second].map((target) => assignRecordUnit(admin, { ...before, expectedUpdatedAt: before.updatedAt.toISOString(), unitId: target.unit.id })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { status: 409 } });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("only allows system admins to create an effective unit for the specified student", async () => {
    const name = `admin-created-${crypto.randomUUID()}`;
    for (const actor of [outsider, creator, { ...outsider, zoneRoles: { "example.com.": "ADMIN" as const } }]) {
      await expect(createUnit(actor, name, editor.studentId!)).rejects.toMatchObject({ status: 403 });
    }
    expect(await db.dnsUnit.findUnique({ where: { name } })).toBeNull();
    const created = await createUnit({ ...admin, globalRole: "SUPER_ADMIN" }, name, ` ${editor.studentId} `);
    const unit = await db.dnsUnit.findUniqueOrThrow({ where: { id: created.unit.id }, include: { members: true } });
    expect(unit.status).toBe("APPROVED");
    expect(unit.reviewedBy).toBe(admin.id);
    expect(unit.members.map((m) => ({ userId: m.userId, role: m.role }))).toEqual([{ userId: editor.id, role: "ADMIN" }]);
    expect((await db.user.findUniqueOrThrow({ where: { id: editor.id } })).globalRole).toBe("USER");
    expect((await listUnits(editor)).some((u) => u.id === unit.id && u.canApply)).toBe(true);
    await expect(createUnit(admin, name, editor.studentId!)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects unknown, disabled, removed and ambiguous student ids without creating units", async () => {
    const target = await account();
    const name = `invalid-manager-${crypto.randomUUID()}`;
    await expect(createUnit(admin, name, `missing-${crypto.randomUUID()}`)).rejects.toMatchObject({ status: 404 });
    await db.user.update({ where: { id: target.id }, data: { disabled: true } });
    await expect(createUnit(admin, name, target.studentId!)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: target.id }, data: { removedAt: new Date() } });
    await expect(createUnit(admin, name, target.studentId!)).rejects.toMatchObject({ status: 404 });
    const duplicate = await account();
    await db.user.update({ where: { id: duplicate.id }, data: { studentId: creator.studentId } });
    await expect(createUnit(admin, name, creator.studentId!)).rejects.toMatchObject({ status: 409 });
    expect(await db.dnsUnit.findUnique({ where: { name } })).toBeNull();
  });
  it("allows an admin to add managers by student id without changing global roles or other members", async () => {
    for (const actor of [creator, viewer, { ...outsider, zoneRoles: { "example.com.": "ADMIN" as const } }]) {
      await expect(assignUnitManager(actor, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    }
    await assignUnitManager(admin, unitId, ` ${outsider.studentId} `);
    await assignUnitManager(admin, unitId, outsider.studentId!);
    expect(await unitAccess(outsider, unitId, "manage")).toBe("ADMIN");
    expect(await unitAccess(creator, unitId, "manage")).toBe("ADMIN");
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).globalRole).toBe("USER");
    await manageUnit(outsider, unitId, { action: "member", userId: viewer.id, role: "EDITOR" });
    expect(await unitAccess(viewer, unitId, "edit")).toBe("EDITOR");
    await assignUnitManager(admin, unitId, viewer.studentId!);
    expect(await unitAccess(viewer, unitId, "manage")).toBe("ADMIN");
    const other = await createUnit(admin, `other-manager-${crypto.randomUUID()}`, editor.studentId!);
    await expect(manageUnit(outsider, other.unit.id, { action: "member", userId: editor.id, role: "VIEWER" })).rejects.toMatchObject({ status: 403 });
    expect(await db.auditLog.count({ where: { userId: admin.id, action: "ASSIGN_UNIT_MANAGER" } })).toBe(3);
  });
  it("rejects invalid manager assignment without changing membership", async () => {
    await expect(assignUnitManager(admin, unitId, `missing-${crypto.randomUUID()}`)).rejects.toMatchObject({ status: 404 });
    await db.user.update({ where: { id: outsider.id }, data: { disabled: true } });
    await expect(assignUnitManager(admin, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: outsider.id }, data: { removedAt: new Date() } });
    await expect(assignUnitManager(admin, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 404 });
    const duplicate = await account();
    await db.user.update({ where: { id: duplicate.id }, data: { studentId: viewer.studentId } });
    await expect(assignUnitManager(admin, unitId, viewer.studentId!)).rejects.toMatchObject({ status: 409 });
    expect(await unitAccess(viewer, unitId, "view")).toBe("VIEWER");
    expect(await db.unitMember.count({ where: { unitId } })).toBe(3);
    await expect(assignUnitManager(admin, `missing-${crypto.randomUUID()}`, editor.studentId!)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps legacy pending units inactive until a system admin reviews them", async () => {
    const pending = await createUnit(admin, `pending-${crypto.randomUUID()}`, outsider.studentId!);
    await db.dnsUnit.update({ where: { id: pending.unit.id }, data: { status: "PENDING" } });
    expect(pending).not.toHaveProperty("passcode");
    expect((await db.dnsUnit.findUniqueOrThrow({ where: { id: pending.unit.id } })).status).toBe("PENDING");
    for (const actor of [outsider, admin]) await expect(unitAccess(actor, pending.unit.id, "edit")).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(outsider, pending.unit.id, viewer.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(reviewUnit(outsider, pending.unit.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    await expect(reviewUnit({ ...outsider, zoneRoles: { "example.com.": "ADMIN" } }, pending.unit.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled([reviewUnit(admin, pending.unit.id, "APPROVE"), reviewUnit(admin, pending.unit.id, "REJECT")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "REVIEW_DNS_UNIT", newValue: { path: ["id"], equals: pending.unit.id } } })).toBe(1);
  });
  it("rejects inactive invitations and submissions, including admin membership bypass", async () => {
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await expect(manageAllowlist(creator, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(creator, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await reviewUnit(admin, unitId, "REJECT", "資料不足");
    expect((await unitDetail(creator, unitId)).unit.reviewNote).toBe("資料不足");
    await expect(assertApplicationPolicy(creator, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(creator, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(admin, ["A"])).rejects.toMatchObject({ status: 403 });
  });
  it("blocks approving DNS while its unit is inactive", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    await reviewUnitRequest(admin, pending.id, "REJECT");
  });
  it("does not accept arbitrary unit ids or legacy personal policy settings", async () => {
    await db.systemSetting.create({ data: { key: "dns-application-policy", value: { allowedTypes: ["A"], ownership: "ANY" } } });
    expect((await readApplicationPolicy()).ownership).toBe("UNIT_ONLY");
    for (const actor of [outsider, admin, viewer]) await expect(assertApplicationPolicy(actor, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["A"])).rejects.toMatchObject({ status: 403 });
  });
  it("creates an admin, enrolls as viewer and hides outsider units", async () => {
    expect(await unitAccess(creator, unitId, "manage")).toBe("ADMIN");
    expect(await unitAccess(viewer, unitId, "view")).toBe("VIEWER");
    expect(await listUnits(outsider)).toEqual([]);
    expect((await unitDetail(viewer, unitId)).allowlist).toEqual([]);
    expect((await unitDetail(creator, unitId)).allowlist).toHaveLength(3);
  });
  it("enforces type and membership rules in application services and detects stale policy edits", async () => {
    const saved = await saveApplicationPolicy({ allowedTypes: ["A"], ownership: "UNIT_ONLY" }, null);
    await expect(assertApplicationPolicy(outsider, ["A"])).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["AAAA"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["A"], unitId)).resolves.toBeUndefined();
    await expect(saveApplicationPolicy({ allowedTypes: [], ownership: "UNIT_ONLY" }, null)).rejects.toMatchObject({ status: 409 });
    expect((await readApplicationPolicy()).updatedAt).toBe(saved.after.updatedAt);
    const source = await sourceRecord();
    await saveApplicationPolicy({ allowedTypes: [], ownership: "UNIT_ONLY" }, saved.after.updatedAt);
    await expect(requestUnitChange(editor, unitId, changeInput(source))).rejects.toMatchObject({ status: 403 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
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
    await enrollAllowlistedUser(viewer.id);
    expect(await db.unitAllowlist.count({ where: { userId: viewer.id } })).toBe(0);
    await expect(unitAccess(viewer, unitId, "view")).rejects.toMatchObject({ status: 403 });
  });
  it("blocks viewer/outsider membership changes and never upgrades a duplicate join", async () => {
    await expect(manageAllowlist(viewer, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(manageUnit(outsider, unitId, { action: "member", userId: viewer.id, role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
    await manageAllowlist(creator, unitId, editor.studentId!);
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
  it("revokes allowlisting on removal and never re-enrolls a removed member", async () => {
    await manageAllowlist(admin, unitId, outsider.studentId!);
    await manageUnit(creator, unitId, { action: "member", userId: outsider.id, role: null });
    await enrollAllowlistedUser(outsider.id);
    await expect(unitAccess(outsider, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await manageAllowlist(creator, unitId, outsider.studentId!);
    expect(await unitAccess(outsider, unitId, "view")).toBe("VIEWER");
    await manageAllowlist(creator, unitId, outsider.studentId!, true);
    await enrollAllowlistedUser(outsider.id);
    await expect(unitAccess(outsider, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(admin, unitId, creator.studentId!, true)).rejects.toMatchObject({ status: 409 });
  });
  it("supports pre-registration allowlisting and concurrent enrollment once", async () => {
    const studentId = crypto.randomUUID();
    await manageAllowlist(creator, unitId, ` ${studentId} `);
    const target = await account();
    await db.user.update({ where: { id: target.id }, data: { studentId } });
    await Promise.all([enrollAllowlistedUser(target.id), enrollAllowlistedUser(target.id)]);
    expect(await unitAccess(target, unitId, "view")).toBe("VIEWER");
    expect(await db.auditLog.count({ where: { userId: target.id, action: "ENROLL_UNIT_ALLOWLIST" } })).toBe(1);
    await expect(assertApplicationPolicy(target, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
  });
  it("denies outsider, editor, disabled and ambiguous identities and honors pending revocation", async () => {
    for (const actor of [viewer, editor, outsider]) await expect(manageAllowlist(actor, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: outsider.id }, data: { disabled: true } });
    await expect(manageAllowlist(creator, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    const duplicate = await account();
    await db.user.update({ where: { id: duplicate.id }, data: { studentId: viewer.studentId } });
    await expect(manageAllowlist(creator, unitId, viewer.studentId!)).rejects.toMatchObject({ status: 409 });
    const studentId = crypto.randomUUID();
    await manageAllowlist(creator, unitId, studentId);
    await manageAllowlist(creator, unitId, studentId, true);
    await db.user.update({ where: { id: duplicate.id }, data: { studentId } });
    await enrollAllowlistedUser(duplicate.id);
    await expect(unitAccess(duplicate, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await manageAllowlist(creator, unitId, studentId);
    await manageUnit(creator, unitId, { action: "member", userId: duplicate.id, role: null });
    await db.unitAllowlist.create({ data: { unitId, studentId } });
    await db.user.update({ where: { id: outsider.id }, data: { studentId, disabled: false } });
    await enrollAllowlistedUser(duplicate.id);
    await expect(unitAccess(duplicate, unitId, "view")).rejects.toMatchObject({ status: 403 });
  });
  it("defers enrollment for inactive units and disabled users, and serializes revocation", async () => {
    const studentId = crypto.randomUUID();
    await manageAllowlist(creator, unitId, studentId);
    const target = await account();
    await db.user.update({ where: { id: target.id }, data: { studentId, disabled: true } });
    await enrollAllowlistedUser(target.id);
    await expect(unitAccess(target, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: target.id }, data: { disabled: false } });
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await enrollAllowlistedUser(target.id);
    await expect(unitAccess(target, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await reviewUnit(admin, unitId, "APPROVE");
    await Promise.all([enrollAllowlistedUser(target.id), manageAllowlist(creator, unitId, studentId, true)]);
    await enrollAllowlistedUser(target.id);
    await expect(unitAccess(target, unitId, "view")).rejects.toMatchObject({ status: 403 });
    expect(await db.unitAllowlist.count({ where: { unitId, studentId } })).toBe(0);
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
    const other = await createUnit(admin, `other-${crypto.randomUUID()}`, editor.studentId!);
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
