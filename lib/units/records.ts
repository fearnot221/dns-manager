import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { Actor, RecordType, RRSet } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { connectionScope, recordId } from "@/lib/inventory/service";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { ApiError } from "@/lib/api/respond";
import { lockActiveUser, lockUnit, requireUnitDatabase, unitAccess, unitAudit, requireActiveUnit } from "./service";
import { replaceUnitValue, deleteUnitValue } from "./change";
import { normalizeRecordContent } from "@/lib/dns/names";
import { rrsetHash } from "@/lib/dns/rrset";
import { assertUnitRequestBudget } from "@/lib/requests/limits";
import { assertApplicationPolicy } from "@/lib/requests/policy";

type UnitOwnershipInput = { expectedUpdatedAt: string; applicantName: string; applicantEmail: string; applicantExtension: string; purpose: string };

export async function unitDetail(actor: Actor, unitId: string, mode: "dns" | "manage" = "dns") {
  requireUnitDatabase();
  const role = await unitAccess(actor, unitId, "view");
  if (mode === "manage" && role !== "ADMIN") throw new ApiError("只有單位管理員或系統管理員可以管理單位。", 403);
  const unit = await db.dnsUnit.findUnique({ where: { id: unitId }, select: { id: true, name: true, status: true, members: { select: { userId: true, role: true, user: { select: { name: true, studentId: true, disabled: true } } } } } });
  if (!unit) throw new ApiError("找不到單位。", 404);
  const members = unit.members.map((m) => ({ userId: m.userId, role: m.role, label: m.user.name || m.user.studentId || "未提供姓名", studentId: m.user.studentId, disabled: m.user.disabled }));
  const allowlist = role === "ADMIN" ? await db.unitAllowlist.findMany({ where: { unitId }, select: { studentId: true, userId: true }, orderBy: { studentId: "asc" } }) : [];
  const summary = { allowlist, unit: { id: unit.id, name: unit.name, status: unit.status }, role, systemAdmin: isGlobalAdmin(actor), canApply: unit.status === "APPROVED" && unit.members.some((m) => m.userId === actor.id && ["EDITOR", "ADMIN"].includes(m.role)), members };
  if (mode === "manage" && !isGlobalAdmin(actor) || unit.status !== "APPROVED") return { ...summary, records: [], recordsError: "" };
  const saved = await db.dnsRecordMetadata.findMany({ where: { unitId }, include: { inspections: { orderBy: { inspectedAt: "desc" }, select: { id: true, inspectedAt: true, inspectorName: true, note: true } } } });
  const scope = await connectionScope();
  const scoped = saved.filter((record) => record.id === recordId(scope, record));
  const zones = new Map<string, RRSet[]>();
  const unavailable: string[] = [];
  for (const name of new Set(scoped.map((r) => r.zoneName))) {
    try { zones.set(name, (await powerdns.getZone(name)).rrsets); }
    catch { unavailable.push(name); }
  }
  const records = scoped.flatMap((record) => {
    const rrset = zones.get(record.zoneName)?.find((r) => r.name === record.recordName && r.type === record.recordType);
    const live = rrset?.records.find((r) => r.content === record.content);
    return live && rrset ? [{ id: record.id, zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content, ttl: rrset.ttl, disabled: live.disabled, purpose: record.purpose, expectedUpdatedAt: record.updatedAt.toISOString(), applicantName: record.applicantName, applicantEmail: record.applicantEmail, applicantExtension: record.applicantExtension, applicantUnit: unit.name, expectedHash: rrsetHash(rrset), inspections: record.inspections }] : [];
  });
  // Only return this unit's record contact details, never account emails or other units' RRset values.
  return { ...summary, records, recordsError: unavailable.length ? `有 ${unavailable.length} 個網域暫時無法取得 DNS，清單可能不完整；成員管理不受影響。` : "" };
}

export async function requestUnitChange(actor: Actor, unitId: string, input: { recordId: string; purpose: string; expectedHash: string } & ({ operation?: "UPDATE"; content: string; ownership?: UnitOwnershipInput } | { operation: "DELETE" })) {
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    await lockUnit(tx, unitId);
    await unitAccess(actor, unitId, "edit", tx);
    const source = await tx.dnsRecordMetadata.findUnique({ where: { id: input.recordId } });
    if (!source || source.unitId !== unitId) throw new ApiError("找不到此單位的 DNS 紀錄。", 404);
    await assertApplicationPolicy(actor, [source.recordType], unitId, tx);
    const scope = await connectionScope();
    if (source.id !== recordId(scope, source)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
    if (!["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(source.recordType)) throw new ApiError("此類型需由系統管理員處理。", 403);
    const deleting = input.operation === "DELETE";
    let content: string;
    try { content = deleting ? source.content : normalizeRecordContent(source.recordType as RecordType, input.content); }
    catch { throw new ApiError("解析內容格式不正確。", 400); }
    const zone = await powerdns.getZone(source.zoneName);
    const current = zone.rrsets.find((r) => r.name === source.recordName && r.type === source.recordType);
    if (!current || rrsetHash(current) !== input.expectedHash) throw new ApiError("DNS 紀錄已變更，請重新載入後再申請。", 409);
    try { if (deleting) deleteUnitValue(current, source.content); else replaceUnitValue(current, source.content, content); }
    catch (error) { throw new ApiError((error as Error).message, 409); }
    if (await tx.dnsRecordRequest.findFirst({ where: { sourceRecordId: source.id, status: "PENDING" } })) throw new ApiError("此紀錄已有待審核變更，請等待審核結果。", 409);
    const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: unitId } });
    const ownership = !deleting ? input.ownership : undefined;
    if (ownership && ownership.expectedUpdatedAt !== source.updatedAt.toISOString()) throw new ApiError("清查資料已更新，請重新載入後再申請。", 409);
    await assertUnitRequestBudget(tx,unitId,1,Buffer.byteLength(JSON.stringify({source,current,input}))+512);
    const saved = await tx.dnsRecordRequest.create({ data: { operation: deleting ? "DELETE" : "UPDATE", userId: actor.id, unitId, sourceRecordId: source.id, originalContent: source.content, expectedRRSet: current as unknown as Prisma.InputJsonValue, connectionScope: scope, zoneName: source.zoneName, recordName: source.recordName, recordType: source.recordType, ttl: current.ttl, content, purpose: input.purpose, sourceMetadataUpdatedAt: source.updatedAt, recordPurpose: ownership?.purpose ?? source.purpose, applicantName: ownership?.applicantName ?? source.applicantName, applicantEmail: ownership?.applicantEmail ?? source.applicantEmail, applicantExtension: ownership?.applicantExtension ?? source.applicantExtension, applicantUnit: unit.name } });
    await unitAudit(tx, actor, deleting ? "REQUEST_UNIT_DNS_DELETE" : "REQUEST_UNIT_DNS_CHANGE", { recordId: source.id, content: source.content }, { requestId: saved.id, unitId, content, purpose: input.purpose });
    return { id: saved.id };
  }, { timeout: 30000 });
}

/** Unit members can update contact/purpose fields and append history, never reassign units or publish DNS. */
export async function inspectUnitRecord(actor: Actor, unitId: string, input: { recordId: string; expectedHash: string; note: string; ownership?: UnitOwnershipInput }) {
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    await lockUnit(tx, unitId);
    await requireActiveUnit(tx, unitId);
    const member = await tx.unitMember.findUnique({ where: { unitId_userId: { unitId, userId: actor.id } } });
    if (!member) throw new ApiError("只有單位成員可以記錄清查。", 403);
    await tx.$queryRaw`SELECT "id" FROM "DnsRecordMetadata" WHERE "id" = ${input.recordId} FOR UPDATE`;
    const source = await tx.dnsRecordMetadata.findUnique({ where: { id: input.recordId } });
    if (!source || source.unitId !== unitId) throw new ApiError("找不到此單位的 DNS 紀錄。", 404);
    if (source.id !== recordId(await connectionScope(), source)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
    const zone = await powerdns.getZone(source.zoneName);
    const current = zone.rrsets.find((r) => r.name === source.recordName && r.type === source.recordType);
    if (!current?.records.some((r) => r.content === source.content) || rrsetHash(current) !== input.expectedHash) throw new ApiError("DNS 紀錄已變更，請重新載入後再清查。", 409);
    let fields;
    if (input.ownership) {
      const { expectedUpdatedAt, ...contact } = input.ownership;
      if (source.updatedAt.toISOString() !== expectedUpdatedAt) throw new ApiError("清查資料已更新，請重新載入後再儲存。", 409);
      const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: unitId }, select: { name: true } });
      fields = { ...contact, applicantUnit: unit.name };
      await tx.dnsRecordMetadata.update({ where: { id: source.id }, data: { ...fields, updatedBy: actor.email } });
    }
    const saved = await tx.dnsInspection.create({ data: { recordId: source.id, inspectorId: actor.id, inspectorEmail: actor.email, inspectorName: actor.name || actor.studentId || "單位成員", note: input.note } });
    await unitAudit(tx, actor, "INSPECT_UNIT_DNS", input.ownership ? { applicantName: source.applicantName, applicantEmail: source.applicantEmail, applicantUnit: source.applicantUnit, applicantExtension: source.applicantExtension, purpose: source.purpose } : null, { ...fields, unitId, recordId: source.id, inspectionId: saved.id, note: input.note });
    return { id: saved.id };
  }, { timeout: 30000 });
}
