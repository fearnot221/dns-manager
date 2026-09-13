import { auditMutation } from "@/lib/audit/mutation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { listInventory, saveInventory } from "@/lib/inventory/service";
import { logAuditEvent } from "@/lib/audit/service";
const schema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), zoneName: z.string().max(253), recordName: z.string().max(253), recordType: z.string().max(20), content: z.string().max(65535), expectedUpdatedAt: z.string().datetime().nullable(), mode: z.enum(["metadata", "inspect"]), applicantName: z.string().trim().max(100).default(""), applicantEmail: z.union([z.email(), z.literal("")]).default(""), applicantUnit: z.string().trim().max(200).default(""), applicantExtension: z.string().trim().max(30).default(""), purpose: z.string().trim().max(1000).default(""), note: z.string().trim().max(2000).default("") }).strict();
export async function GET() { try { const actor = await requireActor(); if (!canAccessZoneManagement(actor)) throw new ApiError("僅管理員可檢視 DNS 清查。", 403); return Response.json({ records: await listInventory(actor) }); } catch (error) { return apiError(error); } }
async function PUTHandler(request: Request) {
  try {
    assertSameOrigin(request); const actor = await requireActor(); const input = schema.parse(await request.json());
    const changes = await saveInventory(actor, input);
    await logAuditEvent({ actor, zone: input.zoneName, recordName: input.recordName, recordType: input.recordType, action: input.mode === "inspect" ? "INSPECT_DNS_RECORD" : "UPDATE_DNS_OWNERSHIP", before: changes.before, after: changes.after, success: true, request });
    return Response.json({ success: true });
  } catch (error) { if ((error as { code?: string }).code === "P2034") return apiError(new ApiError("資料同時被更新，請重新載入後再試。", 409)); return apiError(error); }
}

export const PUT = auditMutation(PUTHandler);
