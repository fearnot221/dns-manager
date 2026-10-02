import { createDataAccount } from "@/lib/users/create";
import { GET as contactOptions } from "@/app/api/users/contacts/route";
import { POST as createAccount } from "@/app/api/users/route";
import { syncDnsHistory } from "@/lib/dns/history-sync";
import { GET as dnsHistory } from "@/app/api/dns-history/route";
import { POST as createDnsRecord, PATCH as updateDnsRecord, DELETE as deleteDnsRecord } from "@/app/api/zones/[zone]/records/route";
import { PowerDNSError } from "@/lib/powerdns/errors";
import { lockDnsZone } from "@/lib/dns/lock";
/** Opt-in: UNIT_TEST_DATABASE_URL must point at a disposable local dns_units_test DB. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/db/client", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasourceUrl: process.env.UNIT_TEST_DATABASE_URL || "postgresql://unused@127.0.0.1:1/unused" }) };
});
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => ({ PDNS_MOCK: "true" }) }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { getZone: vi.fn(), replaceRRSet: vi.fn(), deleteRRSet: vi.fn() } }));
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
import { createUnit, listUnits, manageUnit, unitAccess, assignUnitManager, editUnit } from "@/lib/units/service";
import { inspectUnitRecord, requestUnitChange, unitDetail } from "@/lib/units/records";
import { hashPassword } from "@/lib/auth/password";
import { saveDeletionPassword, assertDeletionPassword, deletionProtectionStatus } from "@/lib/security/deletion-protection";
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
async function removeMembers(id = unitId, actor = admin) {
  const members = await db.unitMember.findMany({ where: { unitId: id } });
  for (const member of members) await manageUnit(actor, id, { action: "member", userId: member.userId, role: null });
}
const changeInput = (source: { id: string; expectedHash: string }) => ({ recordId: source.id, expectedHash: source.expectedHash, content: "192.0.2.10", purpose: "服務搬遷" });

describe.skipIf(!url)("units with real PostgreSQL and isolated fake PowerDNS", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/dns_units_test") throw new Error("Use a disposable localhost dns_units_test database only");
    vi.stubEnv("DATABASE_URL", url!);
    await db.systemSetting.upsert({ where: { key: "dns-deletion-protection" }, create: { key: "dns-deletion-protection", value: { passwordHash: await hashPassword("test-delete-password") } }, update: { value: { passwordHash: await hashPassword("test-delete-password") } } });
  });
  afterAll(async () => { await db.$disconnect(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.systemSetting.deleteMany({ where: { key: "dns-application-policy" } });
    zone = { id: "example.com.", name: "example.com.", kind: "Native", serial: 1, dnssec: false, rrsets: [] };
    vi.mocked(powerdns.getZone).mockImplementation(async () => structuredClone(zone));
    vi.mocked(powerdns.replaceRRSet).mockImplementation(async (_name, rrset) => { zone.rrsets = [structuredClone(rrset)]; });
    vi.mocked(powerdns.deleteRRSet).mockImplementation(async (_zone, name, type) => { zone.rrsets = zone.rrsets.filter((r) => r.name !== name || r.type !== type); });
    [creator, viewer, editor, outsider, admin] = await Promise.all([account(), account(), account(), account(), account("ADMIN")]);
    const created = await createUnit(admin, `test-${crypto.randomUUID()}`, creator.studentId!);
    unitId = created.unit.id;
    await manageAllowlist(creator, unitId, viewer.studentId!);
    await manageAllowlist(creator, unitId, editor.studentId!);
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "EDITOR" });
  });
  it("creates non-login data accounts, scopes contact options and rejects activation and admin grants", async () => {
    vi.mocked(requireActor).mockResolvedValue(admin);
    const input = { name: "資料聯絡人", email: "contact@example.com", unitId, note: "填入用" };
    const response = await createAccount(new Request("http://localhost/api/users", { method: "POST", headers: { Origin: "http://localhost" }, body: JSON.stringify(input) }));
    expect(response.status).toBe(201);
    const { user } = await response.json();
    expect(user).toMatchObject({ dataOnly: true, email: input.email, disabled: true, globalRole: "USER" });
    expect(user.passwordHash).toBeUndefined();
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { accounts: true } });
    expect(stored).toMatchObject({ passwordHash: null, disabled: true, accounts: [], studentId: null });
    for (const body of [{ disabled: false }, { globalRole: "ADMIN" }]) {
      expect((await patchUser(new Request("http://localhost/api/users/" + user.id, { method: "PATCH", headers: { Origin: "http://localhost" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: user.id }) })).status).toBe(409);
    }
    vi.mocked(requireActor).mockResolvedValue(editor);
    expect((await (await contactOptions()).json()).contacts).toContainEqual(expect.objectContaining({ id: user.id, name: input.name, email: input.email }));
    vi.mocked(requireActor).mockResolvedValue(outsider);
    expect((await (await contactOptions()).json()).contacts).not.toContainEqual(expect.objectContaining({ id: user.id }));
    await expect(createDataAccount(editor, input)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "USER" } });
    await expect(createDataAccount(admin, input)).rejects.toMatchObject({ status: 403 });
  });
  it("deduplicates concurrent PowerDNS synchronization and retains the initial snapshot after updates", async () => {
    await sourceRecord();
    await Promise.all([syncDnsHistory(zone.name, "local-mock", zone.rrsets), syncDnsHistory(zone.name, "local-mock", zone.rrsets)]);
    const where = { zone: zone.name, recordName: zone.rrsets[0].name, action: "SYNC_RECORD" };
    expect(await db.auditLog.count({ where })).toBe(1);
    const first = await db.auditLog.findFirstOrThrow({ where });
    zone.rrsets[0].ttl = 600;
    await syncDnsHistory(zone.name, "local-mock", zone.rrsets);
    expect(await db.auditLog.findFirstOrThrow({ where })).toEqual(first);
  });
  it("retains durable DNS history through create, update, deletion and recreation", async () => {
    vi.mocked(requireActor).mockResolvedValue(admin);
    const name = `${unitId}.example.com.`;
    const ctx = { params: Promise.resolve({ zone: zone.name }) };
    const mutate = (method: string, body: unknown) => new Request("http://localhost/api/zones/example.com./records", { method, headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = await createDnsRecord(mutate("POST", { name, type: "A", content: "192.0.2.1", ttl: 300 }), ctx);
    expect(created.status).toBe(200);
    const updated = await updateDnsRecord(mutate("PATCH", { name, type: "A", contents: ["192.0.2.2"], ttl: 600, expectedHash: (await created.json()).hash, deletionPassword: "test-delete-password" }), ctx);
    expect(updated.status).toBe(200);
    const deleted = await deleteDnsRecord(mutate("DELETE", { name, type: "A", expectedHash: (await updated.json()).hash, deletionPassword: "test-delete-password" }), ctx);
    expect(deleted.status).toBe(200);
    const historyRequest = () => dnsHistory(new Request(`http://localhost/api/dns-history?zone=${zone.name}&name=${name}&type=A`));
    const removedHistory = await (await historyRequest()).json();
    expect(removedHistory.total).toBe(4);
    expect(removedHistory.events[0]).toMatchObject({ operation: "DELETE", after: null, legacyScope: false });
    expect((await createDnsRecord(mutate("POST", { name, type: "A", content: "192.0.2.3", ttl: 300 }), ctx)).status).toBe(200);
    const history = await (await historyRequest()).json();
    expect(history.total).toBe(5);
    expect(history.events.map((event: { operation: string }) => event.operation)).toEqual(["CREATE", "DELETE", "UPDATE", "CREATE", "SYNC"]);
    vi.mocked(requireActor).mockResolvedValue(outsider);
    expect((await historyRequest()).status).toBe(404);
  });
  it("includes approved unit changes with their PowerDNS connection scope", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    vi.mocked(requireActor).mockResolvedValue(admin);
    const response = await dnsHistory(new Request(`http://localhost/api/dns-history?zone=${zone.name}&name=${unitId}.example.com.&type=A`));
    const history = await response.json();
    expect(history.total).toBe(2);
    expect(history.events[0]).toMatchObject({ operation: "UPDATE", legacyScope: false, before: { records: expect.arrayContaining([{ content: "192.0.2.1", disabled: false }]) }, after: { records: expect.arrayContaining([{ content: "192.0.2.10", disabled: false }]) } });
  });
  it("requires a fresh deletion password for approvals and persists throttling across rollbacks", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, { operation: "DELETE", recordId: source.id, expectedHash: source.expectedHash, purpose: "退役" });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    for (let i = 0; i < 5; i++) await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "wrong-password")).rejects.toMatchObject({ status: 403 });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 429 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
    await reviewUnitRequest(admin, pending.id, "REJECT");
  });
  it("serializes concurrent password changes and shares persistent attempt limits", async () => {
    const owner = { ...admin, globalRole: "SUPER_ADMIN" as const, portalIdentifier: "115502532" };
    const status = await deletionProtectionStatus();
    const input = { password: "test-delete-password", confirmation: "test-delete-password", expectedUpdatedAt: status.updatedAt };
    const results = await Promise.allSettled([saveDeletionPassword(owner, input), saveDeletionPassword(owner, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const failures = await Promise.allSettled(Array.from({ length: 7 }, () => assertDeletionPassword(admin, "incorrect")));
    expect(failures.filter((result) => result.status === "rejected" && result.reason.status === 403)).toHaveLength(5);
    expect(failures.filter((result) => result.status === "rejected" && result.reason.status === 429)).toHaveLength(2);
    const stored = await db.systemSetting.findUniqueOrThrow({ where: { key: "dns-deletion-protection" } });
    expect(JSON.stringify(stored.value)).not.toContain("test-delete-password");
  });
  it("renames units and current ownership while preserving requests and enforcing unique names", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    const original = await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } });
    await editUnit(admin, unitId, { action: "rename", name: " Renamed-" + unitId + " " });
    expect((await db.dnsUnit.findUniqueOrThrow({ where: { id: unitId } })).name).toBe("Renamed-" + unitId);
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).applicantUnit).toBe("Renamed-" + unitId);
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).applicantUnit).toBe(original.applicantUnit);
    const other = await createUnit(admin, "Other-" + unitId, creator.studentId!);
    await expect(editUnit(admin, unitId, { action: "rename", name: other.unit.name })).rejects.toMatchObject({ status: 409 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it.each([false, true])("blocks deletion with members, including disabled accounts (%s)", async (disabled) => {
    if (disabled) await db.user.updateMany({ where: { id: { in: [creator.id, viewer.id, editor.id] } }, data: { disabled: true } });
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toThrow("仍有 3 位成員");
    expect(await db.unitMember.count({ where: { unitId } })).toBe(3);
    expect(await db.unitAllowlist.count({ where: { unitId } })).toBe(3);
    expect(await db.auditLog.count({ where: { action: "DELETE_DNS_UNIT", userId: admin.id } })).toBe(0);
  });
  it.each(["member", "allowlist"])("only current system admins can remove the last manager through %s", async (method) => {
    const remove = (actor: Actor) => method === "member"
      ? manageUnit(actor, unitId, { action: "member", userId: creator.id, role: null })
      : manageAllowlist(actor, unitId, creator.studentId!, true);
    await expect(remove(creator)).rejects.toMatchObject({ status: 409 });
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "USER" } });
    await expect(remove(admin)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "ADMIN" } });
    await remove(admin);
    expect(await db.unitMember.count({ where: { unitId, role: "ADMIN" } })).toBe(0);
    expect(await db.unitAllowlist.count({ where: { unitId, userId: creator.id } })).toBe(0);
    await enrollAllowlistedUser(creator.id);
    expect(await db.unitMember.count({ where: { unitId, userId: creator.id } })).toBe(0);
    await assignUnitManager(admin, unitId, editor.studentId!);
    expect(await unitAccess(editor, unitId, "manage")).toBe("ADMIN");
  });
  it.each([undefined, "   "])("creates an empty unit and later assigns a manager (%s)", async (studentId) => {
    const name = "empty-" + crypto.randomUUID();
    const created = await createUnit(admin, name, studentId);
    expect(await db.unitMember.count({ where: { unitId: created.unit.id } })).toBe(0);
    expect(await db.unitAllowlist.count({ where: { unitId: created.unit.id } })).toBe(0);
    await assignUnitManager(admin, created.unit.id, creator.studentId!);
    expect(await unitAccess(creator, created.unit.id, "manage")).toBe("ADMIN");
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "USER" } });
    await expect(createUnit(admin, name + "-revoked")).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "ADMIN", disabled: true } });
    await expect(createUnit(admin, name + "-disabled")).rejects.toMatchObject({ status: 403 });
  });
  it("deletes an unused unit after removing memberships, retaining users and audit", async () => {
    await removeMembers();
    await editUnit(admin, unitId, { action: "delete" });
    expect(await db.dnsUnit.findUnique({ where: { id: unitId } })).toBeNull();
    expect(await db.unitMember.count({ where: { unitId } })).toBe(0);
    expect(await db.unitAllowlist.count({ where: { unitId } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: creator.id } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "DELETE_DNS_UNIT", userId: admin.id } })).toBe(1);
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toMatchObject({ status: 404 });
    expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
  });
  it("blocks live DNS but retains closed requests when deleting an empty unit", async () => {
    const source = await sourceRecord();
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toMatchObject({ status: 409 });
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await reviewUnitRequest(admin, pending.id, "REJECT");
    expect(await db.unitMember.count({ where: { unitId } })).toBe(3);
    await removeMembers();
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toThrow("仍有 DNS 解析值");
    zone.rrsets = [];
    await editUnit(admin, unitId, { action: "delete" });
    expect(await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ unitId: null, status: "REJECTED" });
    expect(await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ unitId: null });
  });
  it("deletes a unit after a direct DNS deletion, retaining record inspections and retired task snapshots", async () => {
    const source = await sourceRecord();
    const inspected = await inspectUnitRecord(viewer, unitId, { recordId: source.id, expectedHash: source.expectedHash, note: "歷史清查" });
    const unit = await db.dnsUnit.findUniqueOrThrow({ where: { id: unitId } });
    const snapshot = { unitId, unitName: "historical-name", content: "192.0.2.1" };
    const tasks = await Promise.all(["PENDING", "COMPLETED", "CANCELLED"].map((status) => db.inspectionTask.create({ data: { recordId: source.id, unitId, createdBy: admin.id, status, snapshot } })));
    vi.mocked(requireActor).mockResolvedValue(admin);
    const response = await deleteDnsRecord(new Request("http://localhost/api/zones/example.com/records", { method: "DELETE", headers: { Origin: "http://localhost" }, body: JSON.stringify({ name: zone.rrsets[0].name, type: "A", content: "192.0.2.1", expectedHash: source.expectedHash, deletionPassword: "test-delete-password" }) }), { params: Promise.resolve({ zone: zone.name }) });
    expect(response.status).toBe(200);
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).unitId).toBe(unitId);
    vi.mocked(powerdns.replaceRRSet).mockClear();
    await removeMembers();
    await editUnit(admin, unitId, { action: "delete" });
    expect(await db.dnsUnit.findUnique({ where: { id: unitId } })).toBeNull();
    expect(await db.dnsInspection.findUniqueOrThrow({ where: { id: inspected.id } })).toMatchObject({ recordId: source.id, note: "歷史清查" });
    for (const task of tasks) expect(await db.inspectionTask.findUniqueOrThrow({ where: { id: task.id } })).toEqual({ ...task, unitId: null, archivedUnitId: unitId, archivedUnitName: unit.name });
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "DELETE_DNS_UNIT", userId: admin.id } })).toMatchObject({ oldValue: { id: unitId, recordIds: [source.id], inspectionTaskIds: expect.arrayContaining(tasks.map((task) => task.id)) } });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
  });
  it("keeps exactly one live or archived inspection recipient and requires an archived name", async () => {
    const source = await sourceRecord();
    const base = { recordId: source.id, createdBy: admin.id, status: "PENDING", snapshot: {} };
    for (const invalid of [{}, { unitId, userId: viewer.id }, { unitId, archivedUnitId: unitId, archivedUnitName: "歷史單位" }, { archivedUnitId: unitId }]) {
      await expect(db.inspectionTask.create({ data: { ...base, ...invalid } })).rejects.toThrow();
    }
    const userTask = await db.inspectionTask.create({ data: { ...base, userId: viewer.id } });
    const archivedTask = await db.inspectionTask.create({ data: { ...base, archivedUnitId: unitId, archivedUnitName: "歷史單位" } });
    expect(userTask.userId).toBe(viewer.id);
    expect(archivedTask).toMatchObject({ userId: null, unitId: null, archivedUnitId: unitId });
  });
  it("deletes a unit after an approved last-value deletion and preserves the approved application", async () => {
    const source = await sourceRecord();
    zone.rrsets[0].records.pop();
    const pending = await requestUnitChange(editor, unitId, { operation: "DELETE", recordId: source.id, expectedHash: rrsetHash(zone.rrsets[0]), purpose: "退役" });
    const before = await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } });
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    await removeMembers();
    await editUnit(admin, unitId, { action: "delete" });
    const after = await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after).toMatchObject({ status: "APPROVED", unitId: null, applicantUnit: before.applicantUnit, expectedRRSet: before.expectedRRSet, sourceRecordId: source.id });
    expect(await db.dnsUnit.findUnique({ where: { id: unitId } })).toBeNull();
  });
  it("blocks pending applications even after their DNS value is removed", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    zone.rrsets = [];
    await removeMembers();
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toThrow("待審核申請");
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).unitId).toBe(unitId);
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).unitId).toBe(unitId);
    expect(await db.unitMember.count({ where: { unitId } })).toBe(0);
  });
  it.each(["offline", "scope", "disabled-live"])("fails closed for %s DNS without unlinking history", async (scenario) => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await reviewUnitRequest(admin, pending.id, "REJECT");
    if (scenario === "offline") vi.mocked(powerdns.getZone).mockRejectedValueOnce(new PowerDNSError("offline", 503));
    if (scenario === "scope") await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { id: "other-scope-" + source.id } });
    if (scenario === "disabled-live") zone.rrsets[0].records[0].disabled = true;
    await removeMembers();
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toMatchObject({ status: scenario === "offline" ? 503 : 409 });
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).unitId).toBe(unitId);
    expect(await db.dnsRecordMetadata.count({ where: { unitId } })).toBe(1);
    expect(await db.unitMember.count({ where: { unitId } })).toBe(0);
  });
  it("allows a confirmed deleted Zone and fills missing historical unit names", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await reviewUnitRequest(admin, pending.id, "REJECT");
    const unit = await db.dnsUnit.findUniqueOrThrow({ where: { id: unitId } });
    await db.dnsRecordRequest.update({ where: { id: pending.id }, data: { applicantUnit: null } });
    vi.mocked(powerdns.getZone).mockRejectedValueOnce(new PowerDNSError("Zone not found", 404));
    await removeMembers();
    await editUnit(admin, unitId, { action: "delete" });
    expect(await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ unitId: null, applicantUnit: unit.name });
  });
  it("does not detach DNS ownership while another application writer holds the zone lock", async () => {
    const source = await sourceRecord();
    zone.rrsets = [];
    await removeMembers();
    let release!: () => void, acquired!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const writer = db.$transaction(async (tx) => { await lockDnsZone(tx, zone.name, "local-mock"); acquired(); await gate; });
    await ready;
    try { await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toMatchObject({ status: 409 }); }
    finally { release(); await writer; }
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).unitId).toBe(unitId);
    await editUnit(admin, unitId, { action: "delete" });
  });
  it("lets the verified Logto owner manage units with a stored USER role", async () => {
    await db.user.update({ where: { id: outsider.id }, data: { logtoName: "115502532" } });
    await db.account.create({ data: { userId: outsider.id, type: "oauth", provider: "logto", providerAccountId: crypto.randomUUID() } });
    const owner: Actor = { ...outsider, globalRole: "SUPER_ADMIN", portalIdentifier: "115502532" };
    await editUnit(owner, unitId, { action: "rename", name: "Owner-" + unitId });
    const created = await createUnit(owner, "Owner-created-" + unitId, creator.studentId!);
    await assignUnitManager(owner, created.unit.id, editor.studentId!);
    await removeMembers(created.unit.id, owner);
    await editUnit(owner, created.unit.id, { action: "delete" });
    expect(await db.dnsUnit.findUnique({ where: { id: created.unit.id } })).toBeNull();
    await db.user.update({ where: { id: owner.id }, data: { disabled: true } });
    await expect(editUnit(owner, unitId, { action: "delete" })).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: owner.id }, data: { disabled: false } });
    await db.account.deleteMany({ where: { userId: owner.id } });
    await expect(editUnit(owner, unitId, { action: "delete" })).rejects.toMatchObject({ status: 403 });
    await expect(createUnit(owner, "Forbidden-" + unitId, creator.studentId!)).rejects.toMatchObject({ status: 403 });
    expect(await db.dnsUnit.findUnique({ where: { id: unitId } })).not.toBeNull();
  });
  it("rejects unit managers, zone admins, disabled and revoked system admins for unit edits", async () => {
    for (const actor of [creator, { ...outsider, zoneRoles: { "example.com.": "ADMIN" as const } }]) {
      for (const input of [{ action: "delete" as const }, { action: "rename" as const, name: "Forbidden" }]) await expect(editUnit(actor, unitId, input)).rejects.toMatchObject({ status: 403 });
    }
    await db.user.update({ where: { id: admin.id }, data: { disabled: true } });
    await expect(editUnit(admin, unitId, { action: "delete" })).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: admin.id }, data: { disabled: false, globalRole: "USER" } });
    await expect(editUnit(admin, unitId, { action: "rename", name: "Forbidden" })).rejects.toMatchObject({ status: 403 });
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
  it.each(["2.0.192.in-addr.arpa.", "8.b.d.0.1.0.0.2.ip6.arpa."])("persists reverse inspection history in PostgreSQL: %s", async (zoneName) => {
    const identity = { zoneName, recordName: `${crypto.randomUUID()}.${zoneName}`, recordType: "PTR", content: "host.example.com." };
    zone = { ...zone, name: zoneName, rrsets: [{ name: identity.recordName, type: "PTR", ttl: 300, records: [{ content: identity.content, disabled: false }] }] };
    const id = recordId("local-mock", identity);
    await saveInventory(admin, { ...identity, id, expectedUpdatedAt: null, mode: "inspect-and-metadata", applicantName: "反解管理人", applicantEmail: "", applicantUnit: "", applicantExtension: "", purpose: "反解", note: "確認" });
    const saved = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id }, include: { inspections: true } });
    expect(saved).toMatchObject({ ...identity, applicantName: "反解管理人", purpose: "反解" });
    expect(saved.inspections).toHaveLength(1); expect(saved.inspections[0]).toMatchObject({ note: "確認", inspectorId: admin.id });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
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
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
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
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "APPROVED" } });
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
    expect(unit.reviewedBy).toBeNull();
    expect(unit.reviewedAt).toBeNull();
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
    await expect(manageUnit(outsider, other.unit.id, { action: "member", userId: editor.id, role: "EDITOR" })).rejects.toMatchObject({ status: 403 });
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
    expect(await unitAccess(viewer, unitId, "view")).toBe("EDITOR");
    expect(await db.unitMember.count({ where: { unitId } })).toBe(3);
    await expect(assignUnitManager(admin, `missing-${crypto.randomUUID()}`, editor.studentId!)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps legacy inactive units inaccessible without retroactive activation", async () => {
    const pending = await createUnit(admin, `pending-${crypto.randomUUID()}`, outsider.studentId!);
    await db.dnsUnit.update({ where: { id: pending.unit.id }, data: { status: "PENDING" } });
    expect(pending).not.toHaveProperty("passcode");
    expect((await db.dnsUnit.findUniqueOrThrow({ where: { id: pending.unit.id } })).status).toBe("PENDING");
    for (const actor of [outsider, admin]) await expect(unitAccess(actor, pending.unit.id, "edit")).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(outsider, pending.unit.id, viewer.studentId!)).rejects.toMatchObject({ status: 403 });

  });
  it("rejects inactive invitations and submissions, including admin membership bypass", async () => {
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await expect(manageAllowlist(creator, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(creator, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "REJECTED" } });
    expect((await unitDetail(creator, unitId)).canApply).toBe(false);
    await expect(assertApplicationPolicy(creator, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(creator, unitId, outsider.studentId!)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(admin, ["A"])).rejects.toMatchObject({ status: 403 });
  });
  it("blocks approving DNS while its unit is inactive", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "PENDING" } });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 403 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    await reviewUnitRequest(admin, pending.id, "REJECT");
  });
  it("does not accept arbitrary unit ids or legacy personal policy settings", async () => {
    await db.systemSetting.create({ data: { key: "dns-application-policy", value: { allowedTypes: ["A"], ownership: "ANY" } } });
    expect((await readApplicationPolicy()).ownership).toBe("UNIT_ONLY");
    for (const actor of [outsider, admin]) await expect(assertApplicationPolicy(actor, ["A"], unitId)).rejects.toMatchObject({ status: 403 });
    await expect(assertApplicationPolicy(editor, ["A"])).rejects.toMatchObject({ status: 403 });
  });
  it("creates an admin, enrolls as member and hides outsider units", async () => {
    expect(await unitAccess(creator, unitId, "manage")).toBe("ADMIN");
    expect(await unitAccess(viewer, unitId, "view")).toBe("EDITOR");
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
    expect(await unitAccess(outsider, unitId, "view")).toBe("EDITOR");
    await manageAllowlist(creator, unitId, outsider.studentId!, true);
    await enrollAllowlistedUser(outsider.id);
    await expect(unitAccess(outsider, unitId, "view")).rejects.toMatchObject({ status: 403 });
    await expect(manageAllowlist(creator, unitId, creator.studentId!, true)).rejects.toMatchObject({ status: 409 });
  });
  it("supports pre-registration allowlisting and concurrent enrollment once", async () => {
    const studentId = crypto.randomUUID();
    await manageAllowlist(creator, unitId, ` ${studentId} `);
    const target = await account();
    await db.user.update({ where: { id: target.id }, data: { studentId } });
    await Promise.all([enrollAllowlistedUser(target.id), enrollAllowlistedUser(target.id)]);
    expect(await unitAccess(target, unitId, "view")).toBe("EDITOR");
    expect(await db.auditLog.count({ where: { userId: target.id, action: "ENROLL_UNIT_ALLOWLIST" } })).toBe(1);
    await expect(assertApplicationPolicy(target, ["A"], unitId)).resolves.toBeUndefined();
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
    await db.dnsUnit.update({ where: { id: unitId }, data: { status: "APPROVED" } });
    await Promise.all([enrollAllowlistedUser(target.id), manageAllowlist(creator, unitId, studentId, true)]);
    await enrollAllowlistedUser(target.id);
    await expect(unitAccess(target, unitId, "view")).rejects.toMatchObject({ status: 403 });
    expect(await db.unitAllowlist.count({ where: { unitId, studentId } })).toBe(0);
  });
  it("serializes concurrent demotions and preserves one administrator", async () => {
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: "ADMIN" });
    const results = await Promise.allSettled([
      manageUnit(admin, unitId, { action: "member", userId: creator.id, role: "EDITOR" }),
      manageUnit(admin, unitId, { action: "member", userId: editor.id, role: "EDITOR" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.unitMember.count({ where: { unitId, role: "ADMIN" } })).toBe(1);
  });
  it("allows member submissions and rejects cross-unit changes without touching DNS", async () => {
    const source = await sourceRecord();
    await expect(requestUnitChange(viewer, unitId, changeInput(source))).resolves.toHaveProperty("id");
    const other = await createUnit(admin, `other-${crypto.randomUUID()}`, editor.studentId!);
    await expect(requestUnitChange(editor, other.unit.id, changeInput(source))).rejects.toMatchObject({ status: 404 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("requires system admin review and changes only the approved value", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    await expect(reviewUnitRequest(creator, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 403 });
    await expect(reviewUnitRequest({ ...creator, zoneRoles: { [zone.name]: "ADMIN" } }, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 403 });
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    expect(zone.rrsets[0].records.map((record) => record.content)).toEqual(["192.0.2.10", "192.0.2.99"]);
    expect(zone.rrsets[0].comments).toEqual([{ content: "preserve" }]);
    const detail = await unitDetail(viewer, unitId);
    expect(detail.records.map((record) => record.content)).toEqual(["192.0.2.10"]);
    expect(JSON.stringify(detail)).not.toContain("192.0.2.99");
    expect(JSON.stringify(detail)).not.toContain(editor.email);
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
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
    const results = await Promise.allSettled([reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password"), reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(powerdns.replaceRRSet).toHaveBeenCalledOnce();
  });
  it("blocks stale DNS approval and lets an administrator reject it", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    zone.rrsets[0].ttl = 600;
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect((await reviewUnitRequest(admin, pending.id, "REJECT", "DNS 已更新，請重新申請")).status).toBe("REJECTED");
  });
  it("rechecks membership on approval after removal", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: null });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
    await reviewUnitRequest(admin, pending.id, "REJECT");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });
  it("recovers a DNS-applied / DB-not-yet-saved change without repeating the DNS write", async () => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, changeInput(source));
    zone.rrsets[0].records[0].content = "192.0.2.10";
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect((await unitDetail(viewer, unitId)).records[0].content).toBe("192.0.2.10");
  });
  it("creates shared DNS only after review; multiple values may be reviewed in any order", async () => {
    const input = { unitId, applicantName: "測試", applicantEmail: "contact@example.com", applicantUnit: "forged display name", applicantExtension: "1234", records: ["192.0.2.40", "192.0.2.41"].map((content) => ({ zoneName: zone.name, recordName: `new-${crypto.randomUUID().slice(0, 8)}.example.com.`, recordType: "A", content, ttl: 300, purpose: "unit application" })) };
    input.records[1].recordName = input.records[0].recordName;
    await expect(saveApplication(outsider, input, httpRequest())).rejects.toMatchObject({ status: 403 });
    const saved = await saveApplication(viewer, input, httpRequest());
    const requests = await db.dnsRecordRequest.findMany({ where: { applicationId: saved.applicationId } });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
    expect(requests[0].applicantUnit).not.toBe("forged display name");
    for (const request of requests.reverse()) await reviewUnitRequest(admin, request.id, "APPROVE", undefined, "test-delete-password");
    expect((await unitDetail(viewer, unitId)).records).toHaveLength(2);
  });
  it("lets members append inspections without changing ownership, DNS or exposing contact fields", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const input = { recordId: source.id, expectedHash: source.expectedHash, note: "仍在使用" };
    await expect(inspectUnitRecord(outsider, unitId, input)).rejects.toMatchObject({ status: 403 });
    await expect(inspectUnitRecord(admin, unitId, input)).rejects.toMatchObject({ status: 403 });
    for (const actor of [viewer, editor, creator]) await inspectUnitRecord(actor, unitId, input);
    expect(await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).toEqual(before);
    const detail = await unitDetail(viewer, unitId);
    expect(detail.records[0].inspections).toHaveLength(3);
    expect(detail.records[0].inspections[0].note).toBe("仍在使用");
    expect(JSON.stringify(detail.records)).not.toContain("inspectorEmail");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
    zone.rrsets[0].ttl = 600;
    await expect(inspectUnitRecord(viewer, unitId, input)).rejects.toMatchObject({ status: 409 });
    await db.user.update({ where: { id: viewer.id }, data: { disabled: true } });
    await expect(inspectUnitRecord(viewer, unitId, input)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects cross-unit inspection targets and serializes loss of membership", async () => {
    const source = await sourceRecord();
    const input = { recordId: source.id, expectedHash: source.expectedHash, note: "check" };
    const other = await createUnit(admin, `other-${crypto.randomUUID()}`, viewer.studentId!);
    await expect(inspectUnitRecord(viewer, other.unit.id, input)).rejects.toMatchObject({ status: 404 });
    await manageAllowlist(creator, unitId, viewer.studentId!, true);
    await expect(inspectUnitRecord(viewer, unitId, input)).rejects.toMatchObject({ status: 403 });
    expect(await db.dnsInspection.count({ where: { recordId: source.id } })).toBe(0);
  });
  it.each([false, true])("deletes only the approved value, preserving history (last value: %s)", async (last) => {
    const source = await sourceRecord();
    if (last) zone.rrsets[0].records.pop();
    const expectedHash = rrsetHash(zone.rrsets[0]);
    await inspectUnitRecord(viewer, unitId, { recordId: source.id, expectedHash, note: "已停用服務" });
    const input = { operation: "DELETE" as const, recordId: source.id, expectedHash, purpose: "服務退役" };
    await expect(requestUnitChange(outsider, unitId, input)).rejects.toMatchObject({ status: 403 });
    const pending = await requestUnitChange(viewer, unitId, input);
    expect(await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ operation: "DELETE", content: "192.0.2.1", status: "PENDING" });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
    await expect(requestUnitChange(viewer, unitId, input)).rejects.toMatchObject({ status: 409 });
    await expect(requestUnitChange(editor, unitId, { ...changeInput(source), expectedHash })).rejects.toMatchObject({ status: 409 });
    await expect(reviewUnitRequest(creator, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled([reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password"), reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    if (last) { expect(zone.rrsets).toHaveLength(0); expect(powerdns.deleteRRSet).toHaveBeenCalledOnce(); expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); }
    else { expect(zone.rrsets[0]).toMatchObject({ ttl: 300, comments: [{ content: "preserve" }], records: [{ content: "192.0.2.99", disabled: false }] }); expect(powerdns.replaceRRSet).toHaveBeenCalledOnce(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled(); }
    expect(await db.dnsInspection.count({ where: { recordId: source.id } })).toBe(1);
    expect(await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ unitId: null });
    expect((await unitDetail(viewer, unitId)).records).toHaveLength(0);
  });
  it.each(["stale", "removal", "reassignment", "disabled", "cancelled"])("blocks deletion after %s and makes no DNS write", async (scenario) => {
    const source = await sourceRecord();
    const pending = await requestUnitChange(editor, unitId, { operation: "DELETE", recordId: source.id, expectedHash: source.expectedHash, purpose: "退役" });
    if (scenario === "stale") zone.rrsets[0].records.push({ content: "192.0.2.88", disabled: false });
    if (scenario === "removal") await manageUnit(creator, unitId, { action: "member", userId: editor.id, role: null });
    if (scenario === "reassignment") await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { unitId: null } });
    if (scenario === "disabled") await db.user.update({ where: { id: editor.id }, data: { disabled: true } });
    if (scenario === "cancelled") await db.dnsRecordRequest.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
    if (scenario !== "cancelled") expect((await reviewUnitRequest(admin, pending.id, "REJECT")).status).toBe("REJECTED");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
  });
  it.each([false, true])("recovers an applied deletion after a failed transaction without repeating the DNS write (last: %s)", async (last) => {
    const source = await sourceRecord();
    if (last) zone.rrsets[0].records.pop();
    const pending = await requestUnitChange(editor, unitId, { operation: "DELETE", recordId: source.id, expectedHash: rrsetHash(zone.rrsets[0]), purpose: "退役" });
    // Simulate a successful external write whose response failed before DB commit.
    if (last) vi.mocked(powerdns.deleteRRSet).mockImplementationOnce(async () => { zone.rrsets = []; throw new Error("connection lost after write"); });
    else vi.mocked(powerdns.replaceRRSet).mockImplementationOnce(async (_name, rrset) => { zone.rrsets = [structuredClone(rrset)]; throw new Error("connection lost after write"); });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toThrow("connection lost");
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    expect(last ? powerdns.deleteRRSet : powerdns.replaceRRSet).toHaveBeenCalledOnce();
    expect((await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("APPROVED");
  });
  it("rejects stale deletion submissions and protected record types", async () => {
    const source = await sourceRecord();
    const input = { operation: "DELETE" as const, recordId: source.id, expectedHash: source.expectedHash, purpose: "退役" };
    zone.rrsets[0].ttl = 600;
    await expect(requestUnitChange(viewer, unitId, input)).rejects.toMatchObject({ status: 409 });
    await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { recordType: "SOA" } });
    // A valid SOA identity cannot enter the supported application types.
    const metadata = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const id = recordId("local-mock", metadata);
    await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { id } });
    await expect(requestUnitChange(editor, unitId, { ...input, recordId: id })).rejects.toMatchObject({ status: 403 });
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
  });

  it("carries application contact fields and individual purposes into approved inventory", async () => {
    const input = { unitId, applicantName: "聯絡人", applicantEmail: "service@example.com", applicantUnit: "forged", applicantExtension: "1234", records: ["網站", "資料庫"].map((purpose, i) => ({ zoneName: zone.name, recordName: `contact-${i}-${crypto.randomUUID().slice(0, 8)}.example.com.`, recordType: "A", content: "192.0.2.50", ttl: 300, purpose, notes: `補充-${i}` })) };
    const result = await saveApplication(editor, input, httpRequest());
    const requests = await db.dnsRecordRequest.findMany({ where: { applicationId: result.applicationId }, orderBy: { recordName: "asc" } });
    for (const request of requests) {
      expect(request).toMatchObject({ applicantName: "聯絡人", applicantEmail: "service@example.com", applicantExtension: "1234" });
      expect(request.applicantUnit).not.toBe("forged");
      expect(request.notes).toBe(input.records.find((record) => record.recordName === request.recordName)?.notes);
      await reviewUnitRequest(admin, request.id, "APPROVE", undefined, "test-delete-password");
      const metadata = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: recordId("local-mock", request) } });
      expect(metadata).toMatchObject({ applicantName: "聯絡人", applicantEmail: "service@example.com", applicantExtension: "1234", applicantUnit: request.applicantUnit, purpose: request.purpose, unitId });
    }
  });
  it("separates change reasons from requested inventory information and only applies it after approval", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const ownership = { expectedUpdatedAt: before.updatedAt.toISOString(), applicantName: "服務管理人", applicantEmail: "dns@example.com", applicantExtension: "5678", purpose: "實驗室網站" };
    const pending = await requestUnitChange(editor, unitId, { ...changeInput(source), ownership });
    expect(await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).toEqual(before);
    const request = await db.dnsRecordRequest.findUniqueOrThrow({ where: { id: pending.id } });
    expect(request).toMatchObject({ purpose: "服務搬遷", recordPurpose: "實驗室網站", applicantName: ownership.applicantName, applicantEmail: ownership.applicantEmail });
    await reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password");
    const after = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: recordId("local-mock", request) } });
    expect(after).toMatchObject({ purpose: "實驗室網站", applicantName: ownership.applicantName, applicantEmail: ownership.applicantEmail, applicantExtension: "5678", unitId });
    const detail = await unitDetail(viewer, unitId);
    expect(detail.records[0]).toMatchObject({ applicantName: ownership.applicantName, applicantEmail: ownership.applicantEmail, purpose: "實驗室網站" });
    await expect(unitDetail(outsider, unitId)).rejects.toMatchObject({ status: 403 });
  });
  it("blocks stale ownership forms and approval after inventory edits", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const ownership = { expectedUpdatedAt: "2000-01-01T00:00:00.000Z", applicantName: "", applicantEmail: "", applicantExtension: "", purpose: "new purpose" };
    await expect(requestUnitChange(editor, unitId, { ...changeInput(source), ownership })).rejects.toMatchObject({ status: 409 });
    const pending = await requestUnitChange(editor, unitId, { ...changeInput(source), ownership: { ...ownership, expectedUpdatedAt: before.updatedAt.toISOString() } });
    await db.dnsRecordMetadata.update({ where: { id: source.id }, data: { purpose: "admin update", updatedAt: new Date(before.updatedAt.getTime() + 1000) } });
    await expect(reviewUnitRequest(admin, pending.id, "APPROVE", undefined, "test-delete-password")).rejects.toMatchObject({ status: 409 });
    await reviewUnitRequest(admin, pending.id, "REJECT");
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).purpose).toBe("admin update");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled();
  });

  it("atomically saves a member's complete inspection form and history without changing DNS or unit assignment", async () => {
    const source = await sourceRecord();
    const before = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } });
    const ownership = { expectedUpdatedAt: before.updatedAt.toISOString(), applicantName: "新聯絡人", applicantEmail: "contact@example.com", applicantExtension: "1234", purpose: "系所網站" };
    const input = { recordId: source.id, expectedHash: source.expectedHash, note: "確認仍在使用", ownership };
    const result = await inspectUnitRecord(viewer, unitId, input);
    const saved = await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id }, include: { inspections: true } });
    const unit = await db.dnsUnit.findUniqueOrThrow({ where: { id: unitId } });
    expect(saved).toMatchObject({ unitId, applicantName: ownership.applicantName, applicantEmail: ownership.applicantEmail, applicantExtension: "1234", applicantUnit: unit.name, purpose: "系所網站", content: before.content, updatedBy: viewer.email });
    expect(saved.inspections).toHaveLength(1);
    expect(saved.inspections[0]).toMatchObject({ id: result.id, note: input.note, inspectorId: viewer.id });
    await expect(inspectUnitRecord(viewer, unitId, { ...input, ownership: { ...ownership, expectedUpdatedAt: "2000-01-01T00:00:00.000Z", purpose: "不得覆蓋" } })).rejects.toMatchObject({ status: 409 });
    expect(await db.dnsInspection.count({ where: { recordId: source.id } })).toBe(1);
    expect((await db.dnsRecordMetadata.findUniqueOrThrow({ where: { id: source.id } })).purpose).toBe("系所網站");
    expect(powerdns.replaceRRSet).not.toHaveBeenCalled(); expect(powerdns.deleteRRSet).not.toHaveBeenCalled();
  });

  it("rejects creation after global admin rights were revoked", async () => {
    await db.user.update({ where: { id: admin.id }, data: { globalRole: "USER" } });
    await expect(createUnit(admin, `revoked-${crypto.randomUUID()}`, creator.studentId!)).rejects.toMatchObject({ status: 403 });
  });

});
