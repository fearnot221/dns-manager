import { z } from "zod";
import { auditMutation } from "@/lib/audit/mutation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin, isOwnerEmail } from "@/lib/auth/owner";
import { allowlistEmail, changePortalAllowlist, listPortalAllowlist } from "@/lib/auth/allowlist";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { logAuditEvent } from "@/lib/audit/service";

async function admin() {
  const actor = await requireActor();
  if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可管理登入白名單。", 403);
  return actor;
}
export async function GET() {
  try { await admin(); return Response.json({ entries: await listPortalAllowlist() }); }
  catch (error) { return apiError(error); }
}
async function change(request: Request, remove: boolean) {
  try {
    assertSameOrigin(request);
    const actor = await admin();
    const { email } = z.object({ email: allowlistEmail }).strict().parse(await request.json());
    if (isOwnerEmail(email)) throw new ApiError("此項目受保護，無法修改。", 403);
    const before = (await listPortalAllowlist()).find((entry) => entry.email === email) ?? null;
    await changePortalAllowlist(email, actor.email, remove);
    const after = remove ? null : (await listPortalAllowlist()).find((entry) => entry.email === email);
    await logAuditEvent({ actor, zone: "", action: remove ? "REMOVE_PORTAL_ALLOWLIST" : "ADD_PORTAL_ALLOWLIST", before, after, recordName: email, success: true, request });
    return Response.json({ message: remove ? "已移除 Portal 登入權限。" : "已加入白名單。" });
  } catch (error) { return apiError(error); }
}
export const POST = auditMutation((request: Request) => change(request, false));
export const DELETE = auditMutation((request: Request) => change(request, true));
