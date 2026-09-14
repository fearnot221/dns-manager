import "server-only";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor, RecordType, RRSet } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { connectionScope, recordId } from "@/lib/inventory/service";
import { addRecord } from "@/lib/dns/rrset";
import { lockUnit, unitAudit } from "./service";
import { canSubmitUnitRequest } from "./policy";
import { replaceUnitValue, unitChangeState, unitRRSetHash } from "./change";

/** Unit roles NEVER authorize publication; only global system administrators review. */
export async function reviewUnitRequest(actor: Actor, id: string, decision: "APPROVE" | "REJECT", note?: string) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以審核單位申請。", 403);
  return db.$transaction(async (tx) => {
    const initial = await tx.dnsRecordRequest.findUnique({ where: { id }, select: { unitId: true } });
    if (!initial?.unitId) throw new ApiError("找不到單位申請。", 404);
    await lockUnit(tx, initial.unitId);
    const item = await tx.dnsRecordRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (item.status !== "PENDING") throw new ApiError("此申請已審核，請重新載入。", 409);
    if (decision === "APPROVE") {
      const member = await tx.unitMember.findUnique({ where: { unitId_userId: { unitId: initial.unitId, userId: item.userId } } });
      // A system administrator can submit for any unit. Revoked member privileges invalidate approval.
      if (item.user.disabled || (!canSubmitUnitRequest(member?.role) && !["ADMIN", "SUPER_ADMIN"].includes(item.user.globalRole))) throw new ApiError("申請人已無單位編輯權限，請退回此申請。", 409);
      const scope = await connectionScope();
      if (item.connectionScope !== scope) throw new ApiError("PowerDNS 連線已變更，請退回並重新申請。", 409);
      const zone = await powerdns.getZone(item.zoneName);
      const current = zone.rrsets.find((r) => r.name === item.recordName && r.type === item.recordType);
      const targetId = recordId(scope, item);
      const target = await tx.dnsRecordMetadata.findUnique({ where: { id: targetId } });
      let next: RRSet | undefined;
      if (item.sourceRecordId) {
        const source = await tx.dnsRecordMetadata.findUnique({ where: { id: item.sourceRecordId } });
        if (!source || source.unitId !== initial.unitId || source.content !== item.originalContent || !item.expectedRRSet) throw new ApiError("原紀錄歸屬已變更，請退回並重新申請。", 409);
        if (target) throw new ApiError("目標內容已有紀錄資料，請由系統管理員確認歸屬後處理。", 409);
        const before = item.expectedRRSet as unknown as RRSet;
        next = replaceUnitValue(before, source.content, item.content);
        const state = unitChangeState(current, before, next);
        if (state === "CONFLICT") throw new ApiError("DNS 已被其他操作更新，不能覆蓋；請退回並重新申請。", 409);
        if (state === "READY") await powerdns.replaceRRSet(item.zoneName, next);
        const { id: _id, updatedAt: _updatedAt, ...metadata } = source;
        void _id; void _updatedAt;
        // Retain historical inspections on the old identity; do not mislabel them as inspections of the new value.
        await tx.dnsRecordMetadata.create({ data: { ...metadata, id: targetId, content: item.content, updatedBy: actor.email } });
        await tx.dnsRecordMetadata.update({ where: { id: source.id }, data: { unitId: null } });
      } else {
        const before = item.expectedRRSet as unknown as RRSet | null;
        if (before?.records.some((r) => r.content === item.content)) throw new ApiError("此解析值在申請時已存在，不能取得共享權限。", 409);
        if (target && target.unitId !== initial.unitId) throw new ApiError("此解析值已有其他歸屬資料，請確認後處理。", 409);
        const expectedAfter = { ...before, ...addRecord(before ?? undefined, { name: item.recordName, type: item.recordType as RecordType, ttl: before?.ttl ?? item.ttl }, item.content) };
        if (!current?.records.some((r) => r.content === item.content)) {
          // Independent additions in a multi-record application need not be approved in order.
          next = { ...current, ...addRecord(current, { name: item.recordName, type: item.recordType as RecordType, ttl: current?.ttl ?? item.ttl }, item.content) };
          await powerdns.replaceRRSet(item.zoneName, next);
        } else if (target?.unitId !== initial.unitId && unitRRSetHash(current) !== unitRRSetHash(expectedAfter)) {
          throw new ApiError("解析值已出現但歸屬無法確認，請由系統管理員處理。", 409);
        }
        await tx.dnsRecordMetadata.upsert({ where: { id: targetId }, update: {}, create: { id: targetId, unitId: initial.unitId, zoneName: item.zoneName, recordName: item.recordName, recordType: item.recordType, content: item.content, applicantName: item.applicantName || "", applicantEmail: item.user.email, applicantUnit: item.applicantUnit || "", applicantExtension: item.applicantExtension || "", purpose: item.purpose || "", updatedBy: actor.email } });
      }
      await unitAudit(tx, actor, "APPLY_UNIT_DNS_REQUEST", current ?? null, { requestId: id, unitId: initial.unitId, rrset: next ?? current });
    }
    const saved = await tx.dnsRecordRequest.update({ where: { id }, data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewerId: actor.id, reviewedAt: new Date(), reviewNote: note || null } });
    await unitAudit(tx, actor, "REVIEW_UNIT_DNS_REQUEST", { requestId: id, status: item.status }, { requestId: id, status: saved.status, reviewNote: note ?? "" });
    return saved;
  }, { timeout: 60000 });
}
