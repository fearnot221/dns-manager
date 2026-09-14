import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { Actor, RecordType, RRSet } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { connectionScope, recordId } from "@/lib/inventory/service";
import { ApiError } from "@/lib/api/respond";
import { lockUnit, requireUnitDatabase, unitAccess, unitAudit } from "./service";
import { replaceUnitValue } from "./change";
import { normalizeRecordContent } from "@/lib/dns/names";
import { rrsetHash } from "@/lib/dns/rrset";

export async function unitDetail(actor: Actor, unitId: string) {
  requireUnitDatabase();
  const role = await unitAccess(actor, unitId, "view");
  const unit = await db.dnsUnit.findUnique({ where: { id: unitId }, select: { id: true, name: true, members: { select: { userId: true, role: true, user: { select: { studentId: true, disabled: true, accounts: { where: { provider: "ncu-portal" }, select: { providerAccountId: true } } } } } } } });
  if (!unit) throw new ApiError("找不到單位。", 404);
  const saved = await db.dnsRecordMetadata.findMany({ where: { unitId } });
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
    return live && rrset ? [{ id: record.id, zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content, ttl: rrset.ttl, disabled: live.disabled, purpose: record.purpose, expectedHash: rrsetHash(rrset) }] : [];
  });
  // Do not return emails, private applicant contact fields, or other units' RRset values.
  return { unit: { id: unit.id, name: unit.name }, role, members: unit.members.map((m) => ({ userId: m.userId, role: m.role, label: m.user.studentId || m.user.accounts[0]?.providerAccountId || `未綁定 Portal（${m.userId}）`, disabled: m.user.disabled })), records, recordsError: unavailable.length ? `有 ${unavailable.length} 個網域暫時無法取得 DNS，清單可能不完整；成員管理不受影響。` : "" };
}

export async function requestUnitChange(actor: Actor, unitId: string, input: { recordId: string; content: string; purpose: string; expectedHash: string }) {
  requireUnitDatabase();
  return db.$transaction(async (tx) => {
    await lockUnit(tx, unitId);
    await unitAccess(actor, unitId, "edit", tx);
    const source = await tx.dnsRecordMetadata.findUnique({ where: { id: input.recordId } });
    if (!source || source.unitId !== unitId) throw new ApiError("找不到此單位的 DNS 紀錄。", 404);
    const scope = await connectionScope();
    if (source.id !== recordId(scope, source)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
    if (!["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(source.recordType)) throw new ApiError("此類型需由系統管理員處理。", 403);
    let content: string;
    try { content = normalizeRecordContent(source.recordType as RecordType, input.content); }
    catch { throw new ApiError("解析內容格式不正確。", 400); }
    const zone = await powerdns.getZone(source.zoneName);
    const current = zone.rrsets.find((r) => r.name === source.recordName && r.type === source.recordType);
    if (!current || rrsetHash(current) !== input.expectedHash) throw new ApiError("DNS 紀錄已變更，請重新載入後再申請。", 409);
    try { replaceUnitValue(current, source.content, content); }
    catch (error) { throw new ApiError((error as Error).message, 409); }
    if (await tx.dnsRecordRequest.findFirst({ where: { sourceRecordId: source.id, status: "PENDING" } })) throw new ApiError("此紀錄已有待審核變更，請等待審核結果。", 409);
    const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: unitId } });
    const saved = await tx.dnsRecordRequest.create({ data: { userId: actor.id, unitId, sourceRecordId: source.id, originalContent: source.content, expectedRRSet: current as unknown as Prisma.InputJsonValue, connectionScope: scope, zoneName: source.zoneName, recordName: source.recordName, recordType: source.recordType, ttl: current.ttl, content, purpose: input.purpose, applicantUnit: unit.name } });
    await unitAudit(tx, actor, "REQUEST_UNIT_DNS_CHANGE", { recordId: source.id, content: source.content }, { requestId: saved.id, unitId, content, purpose: input.purpose });
    return { id: saved.id };
  }, { timeout: 30000 });
}
