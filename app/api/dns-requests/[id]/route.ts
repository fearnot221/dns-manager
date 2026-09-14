import { auditMutation } from "@/lib/audit/mutation";
import type { RecordType, RRSet } from "@/lib/dns/types";
import { captureApprovedRequest } from "@/lib/inventory/service";
import { requireActor } from "@/lib/auth/session";
import { canReviewDnsRequest } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { addRecord } from "@/lib/dns/rrset";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, ApiError, notFoundUnless } from "@/lib/api/respond";
import { dnsRequestDecisionSchema } from "@/lib/validation/api";
import { logAuditEvent } from "@/lib/audit/service";
import { findDevRequest, isDevRequestStore, reviewDevRequest } from "@/lib/requests/dev-store";
import { reviewUnitRequest } from "@/lib/units/review";

async function PATCHHandler(request: Request, { params }: RouteContext<"/api/dns-requests/[id]">) {
  let actor;
  let recordRequest;
  try {
    actor = await requireActor();
    const { id } = await params;
    const decision = dnsRequestDecisionSchema.parse(await request.json());
    recordRequest = isDevRequestStore() ? findDevRequest(id) : await db.dnsRecordRequest.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } } } });
    if (recordRequest && "unitId" in recordRequest && recordRequest.unitId) {
      const reviewed = await reviewUnitRequest(actor, id, decision.decision, decision.reviewNote);
      return Response.json({ request: { id: reviewed.id, status: reviewed.status } });
    }
    notFoundUnless(Boolean(recordRequest) && canReviewDnsRequest(actor, recordRequest!));
    if (recordRequest!.status !== "PENDING") throw new ApiError("This request has already been reviewed", 409);

    if (decision.decision === "APPROVE") {
      const recordType = recordRequest!.recordType as RecordType;
      const zone = await powerdns.getZone(recordRequest!.zoneName);
      const current = zone.rrsets.find((rrset) => rrset.name === recordRequest!.recordName && rrset.type === recordType);
      const alreadyPresent = current?.records.some((record) => record.content === recordRequest!.content);
      if (!alreadyPresent) {
        const next: RRSet = addRecord(
          current,
          { name: recordRequest!.recordName, type: recordType, ttl: current?.ttl ?? recordRequest!.ttl },
          recordRequest!.content,
        );
        await powerdns.replaceRRSet(recordRequest!.zoneName, next);
        await logAuditEvent({ actor, zone: recordRequest!.zoneName, recordName: recordRequest!.recordName, recordType, action: "APPLY_APPROVED_DNS_RECORD", before: current, after: next, success: true, request });
      }
      // Keep approval retryable if storing ownership fails after PowerDNS succeeds.
      await captureApprovedRequest(actor, recordRequest!);
    }

    const reviewed = isDevRequestStore()
      ? reviewDevRequest(recordRequest!.id, actor, decision.decision, decision.reviewNote)!
      : await db.dnsRecordRequest.update({
          where: { id: recordRequest!.id },
          data: {
            status: decision.decision === "APPROVE" ? "APPROVED" : "REJECTED",
            reviewNote: decision.reviewNote || null,
            reviewedAt: new Date(),
            reviewerId: actor.id === "dev-admin" ? null : actor.id,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            reviewer: { select: { name: true, email: true } },
          },
        });
    await logAuditEvent({
      actor,
      zone: reviewed.zoneName,
      action: decision.decision === "APPROVE" ? "APPROVE_DNS_REQUEST" : "REJECT_DNS_REQUEST",
      recordName: reviewed.recordName,
      recordType: reviewed.recordType,
      before: recordRequest,
      after: reviewed,
      success: true,
      request,
    });
    return Response.json({ request: reviewed });
  } catch (error) {
    if (actor && recordRequest) await logAuditEvent({
      actor,
      zone: recordRequest.zoneName,
      action: "REVIEW_DNS_REQUEST",
      recordName: recordRequest.recordName,
      recordType: recordRequest.recordType,
      before: recordRequest,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      request,
    }).catch(() => undefined);
    return apiError(error);
  }
}

export const PATCH = auditMutation(PATCHHandler);
