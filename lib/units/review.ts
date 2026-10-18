import { inspectionEventSnapshot } from "@/lib/inspection-events/service";
import { assertDeletionPassword } from "@/lib/security/deletion-protection";
import "server-only";
import { lockDnsZone } from "@/lib/dns/lock";
import { enqueueReviewMail } from "@/lib/mail/queue";
import { Prisma } from "@prisma/client";
import { redactAudit } from "@/lib/audit/redact";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor, RecordType, RRSet } from "@/lib/dns/types";
import { powerdns } from "@/lib/powerdns/client";
import { connectionScope, recordId } from "@/lib/inventory/service";
import { addRecord } from "@/lib/dns/rrset";
import { lockUnit, unitAudit, requireActiveUnit, lockActiveUser, isCurrentUnitAdmin } from "./service";
import { canSubmitUnitRequest } from "./policy";
import { deleteUnitValue, replaceUnitValue, unitChangeState, unitRRSetHash } from "./change";
import { beginPublication, publicationPendingMessage, publicationState } from "@/lib/requests/publication";

/** Unit roles NEVER authorize publication; only global system administrators review. */
export async function reviewUnitRequest(actor: Actor, id: string, decision: "APPROVE" | "REJECT", note?: string, deletionPassword?: string) {
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以審核單位申請。", 403);
  return db.$transaction(async (tx) => {
    const initial = await tx.dnsRecordRequest.findUnique({ where: { id }, select: { unitId: true, userId: true } });
    if (!initial?.unitId) throw new ApiError("找不到單位申請。", 404);
    // Same user -> unit lock order as removal and membership changes. An inactive
    // applicant can still have an already-published operation reconciled.
    for (const userId of [...new Set([actor.id, initial.userId])].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    }
    await lockActiveUser(tx, actor.id);
    if (!await isCurrentUnitAdmin(tx, actor)) throw new ApiError("系統管理員權限已變更，請重新登入。", 403);
    await lockUnit(tx, initial.unitId);
    const item = await tx.dnsRecordRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (item.status !== "PENDING") throw new ApiError("此申請已審核，請重新載入。", 409);
    const publication = await tx.dnsRequestPublication.findUnique({ where: { requestId: id } });
    if (decision === "REJECT") {
      if (publication) throw new ApiError(publicationPendingMessage, 409);
      // Protect pending requests interrupted before publication journaling was installed.
      if (item.operation !== "CLAIM" && item.connectionScope === await connectionScope()) {
        await lockDnsZone(tx, item.zoneName, item.connectionScope);
        const current = (await powerdns.getZone(item.zoneName)).rrsets.find(r => r.name === item.recordName && r.type === item.recordType);
        const before = item.expectedRRSet as unknown as RRSet | null;
        const applied = item.sourceRecordId && before && item.originalContent
          ? unitChangeState(current, before, item.operation === "DELETE" ? deleteUnitValue(before, item.originalContent) : replaceUnitValue(before, item.originalContent, item.content)) === "APPLIED"
          : current?.records.some(r => r.content === item.content);
        if (applied) throw new ApiError("DNS 已符合此申請結果，不能直接退回；請重新核准以完成同步。", 409);
      }
    }
    if (decision === "APPROVE") {
      if (item.operation === "DELETE" && !item.sourceRecordId) throw new ApiError("刪除申請缺少原紀錄，請退回並重新申請。", 409);
      const scope = await connectionScope();
      if (item.connectionScope !== scope) throw new ApiError("PowerDNS 連線已變更，請退回並重新申請。", 409);
      await lockDnsZone(tx, item.zoneName, scope);
      const zone = await powerdns.getZone(item.zoneName);
      const current = zone.rrsets.find((r) => r.name === item.recordName && r.type === item.recordType);
      const recoveryState = publication ? publicationState(publication, scope, current) : null;
      if (recoveryState !== "APPLIED") {
        await requireActiveUnit(tx, initial.unitId);
        const member = await tx.unitMember.findUnique({ where: { unitId_userId: { unitId: initial.unitId, userId: item.userId } } });
        if (item.user.disabled || item.user.removedAt || !canSubmitUnitRequest(member?.role)) throw new ApiError("申請人已無單位編輯權限，請退回此申請。", 409);
      }
      const targetId = recordId(scope, item);
      const target = await tx.dnsRecordMetadata.findUnique({ where: { id: targetId } });
      let next: RRSet | undefined;
      let auditBefore = current ?? null;
      if (item.operation === "CLAIM") {
        if (!current?.records.some(r => r.content === item.content)) throw new ApiError("申請的解析值已不存在，請退回並重新申請。", 409);
        await tx.$queryRaw`SELECT "id" FROM "DnsRecordMetadata" WHERE "id" = ${targetId} FOR UPDATE`;
        const metadata = await tx.dnsRecordMetadata.findUnique({ where: { id: targetId } });
        if (metadata?.unitId || (metadata?.updatedAt.getTime() ?? null) !== (item.sourceMetadataUpdatedAt?.getTime() ?? null)) throw new ApiError("歸屬或清查資料已變更，請退回並重新申請。", 409);
        const unit = await tx.dnsUnit.findUniqueOrThrow({ where: { id: initial.unitId }, select: { name: true } });
        const ownership = { unitId: initial.unitId, applicantName: item.applicantName || "", applicantEmail: item.applicantEmail || "", applicantExtension: item.applicantExtension || "", applicantUnit: unit.name, purpose: item.purpose || "", updatedBy: actor.email };
        if (metadata) await tx.dnsRecordMetadata.update({ where: { id: targetId }, data: ownership });
        else await tx.dnsRecordMetadata.create({ data: { id: targetId, zoneName: item.zoneName, recordName: item.recordName, recordType: item.recordType, content: item.content, ...ownership } });
        const inspectedAt = new Date();
        const event = await inspectionEventSnapshot(inspectedAt, tx);
        const inspection = await tx.dnsInspection.create({ data: { recordId: targetId, inspectedAt, ...event, inspectorId: actor.id, inspectorEmail: actor.email, inspectorName: actor.name || actor.studentId || "系統管理員", note: `DNS 歸屬申請核准（${id}）；申請人：${item.applicantName || item.user.name || item.userId}；單位：${unit.name}；用途：${item.purpose || ""}；備註：${item.notes || ""}；審核回覆：${note || ""}` } });
        await tx.auditLog.create({ data: { dnsScope: scope, userId: actor.id, userEmail: actor.email, zone: item.zoneName, recordName: item.recordName, recordType: item.recordType, action: "ASSIGN_DNS_UNIT", success: true, oldValue: { recordId: targetId, content: item.content, unitId: null, applicantUnit: metadata?.applicantUnit ?? "" }, newValue: { recordId: targetId, content: item.content, ...ownership, requestId: id, inspectionId: inspection.id } } });
      } else if (item.sourceRecordId) {
        await tx.$queryRaw`SELECT "id" FROM "DnsRecordMetadata" WHERE "id" = ${item.sourceRecordId} FOR UPDATE`;
        const source = await tx.dnsRecordMetadata.findUnique({ where: { id: item.sourceRecordId } });
        if (!source || source.unitId !== initial.unitId || source.content !== item.originalContent || !item.expectedRRSet) throw new ApiError("原紀錄歸屬已變更，請退回並重新申請。", 409);
        if (item.sourceMetadataUpdatedAt && source.updatedAt.getTime() !== item.sourceMetadataUpdatedAt.getTime()) throw new ApiError("清查或歸屬資料已更新，請退回並重新申請。", 409);
        if (item.operation !== "DELETE" && target?.unitId) throw new ApiError("目標內容已有紀錄資料，請由系統管理員確認歸屬後處理。", 409);
        const before = item.expectedRRSet as unknown as RRSet;
        if (source.id !== recordId(scope, source) || source.zoneName !== item.zoneName || source.recordName !== item.recordName || source.recordType !== item.recordType) throw new ApiError("原紀錄識別不符，請重新申請。", 409);
        next = item.operation === "DELETE" ? deleteUnitValue(before, source.content) : replaceUnitValue(before, source.content, item.content);
        const state = recoveryState ?? unitChangeState(current, before, next);
        if (state === "CONFLICT") throw new ApiError("DNS 已被其他操作更新，不能覆蓋；請退回並重新申請。", 409);
        await assertDeletionPassword(actor, deletionPassword);
        if (state === "APPLIED") auditBefore = before;
        if (state === "READY") {
          if (!publication) await beginPublication(id, scope, actor.id, current, next);
          if (next) await powerdns.replaceRRSet(item.zoneName, next);
          else await powerdns.deleteRRSet(item.zoneName, item.recordName, item.recordType as RecordType);
        }
        const { id: _id, updatedAt: _updatedAt, ...metadata } = source;
        void _id; void _updatedAt;
        // Retain historical inspections on the old identity; do not mislabel them as inspections of the new value.
        if (item.operation !== "DELETE") {
          const replacement = { ...metadata, content: item.content,
            ...(item.recordPurpose !== null ? { purpose: item.recordPurpose, applicantName: item.applicantName ?? source.applicantName, applicantEmail: item.applicantEmail ?? source.applicantEmail, applicantExtension: item.applicantExtension ?? source.applicantExtension, applicantUnit: item.applicantUnit ?? source.applicantUnit } : {}),
            updatedBy: actor.email };
          // A detached historical identity can be reused after live-state validation.
          // Its inspections remain attached to the same DNS value, never moved from source.
          await tx.dnsRecordMetadata.upsert({ where: { id: targetId }, create: { id: targetId, ...replacement }, update: replacement });
        }
        await tx.dnsRecordMetadata.update({ where: { id: source.id }, data: { unitId: null } });
      } else {
        const before = item.expectedRRSet as unknown as RRSet | null;
        if (before?.records.some((r) => r.content === item.content)) throw new ApiError("此解析值在申請時已存在，不能取得共享權限。", 409);
        if (target?.unitId && target.unitId !== initial.unitId) throw new ApiError("此解析值已有其他歸屬資料，請確認後處理。", 409);
        const expectedAfter = { ...before, ...addRecord(before ?? undefined, { name: item.recordName, type: item.recordType as RecordType, ttl: before?.ttl ?? item.ttl }, item.content) };
        if (publication) {
          next = publication.afterRRSet as unknown as RRSet;
          auditBefore = publication.beforeRRSet as unknown as RRSet | null;
          if (recoveryState === "READY") await powerdns.replaceRRSet(item.zoneName, next);
        } else if (!current?.records.some((r) => r.content === item.content)) {
          // Independent additions in a multi-record application need not be approved in order.
          next = { ...current, ...addRecord(current, { name: item.recordName, type: item.recordType as RecordType, ttl: current?.ttl ?? item.ttl }, item.content) };
          await beginPublication(id, scope, actor.id, current, next);
          await powerdns.replaceRRSet(item.zoneName, next);
        } else if (target?.unitId !== initial.unitId && unitRRSetHash(current) !== unitRRSetHash(expectedAfter)) {
          throw new ApiError("解析值已出現但歸屬無法確認，請由系統管理員處理。", 409);
        }
        if (current && unitRRSetHash(current) === unitRRSetHash(expectedAfter)) auditBefore = before;
        const ownership = { unitId: initial.unitId, applicantName: item.applicantName || "", applicantEmail: item.applicantEmail ?? item.user.portalEmail ?? "", applicantUnit: item.applicantUnit || "", applicantExtension: item.applicantExtension || "", purpose: item.purpose || "", updatedBy: actor.email };
        await tx.dnsRecordMetadata.upsert({ where: { id: targetId }, update: target?.unitId ? {} : ownership, create: { id: targetId, zoneName: item.zoneName, recordName: item.recordName, recordType: item.recordType, content: item.content, ...ownership } });
      }
      if (item.operation !== "CLAIM") await tx.auditLog.create({ data: { dnsScope: scope, userId: actor.id, userEmail: actor.email, zone: item.zoneName, recordName: item.recordName, recordType: item.recordType, action: "APPLY_UNIT_DNS_REQUEST", success: true, oldValue: auditBefore ? redactAudit(auditBefore) as Prisma.InputJsonValue : Prisma.JsonNull, newValue: redactAudit({ requestId: id, unitId: initial.unitId, operation: item.operation, rrset: item.operation === "DELETE" ? next ?? null : next ?? current }) as Prisma.InputJsonValue } });
    }
    const saved = await tx.dnsRecordRequest.update({ where: { id }, data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewerId: actor.id, reviewedAt: new Date(), reviewNote: note || null } });
    if (decision === "APPROVE") await tx.dnsRequestPublication.updateMany({ where: { requestId: id }, data: { completedAt: new Date() } });
    const unit = await tx.dnsUnit.findUnique({ where: { id: initial.unitId }, select: { name: true } });
    await enqueueReviewMail(tx, { ...saved, user: item.user }, unit?.name ?? "");
    await unitAudit(tx, actor, "REVIEW_UNIT_DNS_REQUEST", { requestId: id, status: item.status }, { requestId: id, status: saved.status, reviewNote: note ?? "" });
    return saved;
  }, { timeout: 60000 });
}
