import { auditMutation } from "@/lib/audit/mutation";
import { accountPresentation } from "@/lib/users/presentation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin, isOwner } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { isLocalDemo } from "@/lib/db/local-store";
import { demoUsers } from "@/lib/users/demo";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";

export async function GET() {
  try {
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可管理使用者。", 403);
    const users = isLocalDemo() ? await demoUsers((items) => items.map((user) => ({ ...user, portalIdentifier: user.id === "dev-owner" ? "115502532" : user.portalIdentifier, zoneAdmin: false }))) : (await db.user.findMany({ where: { removedAt: null }, select: { name: true, id: true, studentId: true, logtoName: true, portalEmail: true, note: true, accounts: { where: { provider: { in: ["ncu-portal", "logto"] } }, select: { provider: true, providerAccountId: true } }, email: true, globalRole: true, disabled: true, createdAt: true, zonePermissions: { where: { role: "ADMIN" }, select: { id: true } }, groupMemberships: { select: { group: { select: { zonePermissions: { where: { role: "ADMIN" }, select: { id: true } } } } } } } })).map(({ zonePermissions, groupMemberships, ...user }) => ({ ...user, zoneAdmin: !!zonePermissions.length || groupMemberships.some((item) => item.group.zonePermissions.length > 0) }));
    return Response.json({ users: users.map(accountPresentation), canAssignAdmin: isOwner(actor), canRemoveUsers: isOwner(actor) });
  } catch (error) { return apiError(error); }
}
async function POSTHandler(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可建立使用者。", 403);
    return Response.json({ error: "帳號由 Portal 首次登入自動建立，請於登入後管理角色。" }, { status: 405, headers: { Allow: "GET" } });
  } catch (error) { return apiError(error); }
}

export const POST = auditMutation(POSTHandler);
