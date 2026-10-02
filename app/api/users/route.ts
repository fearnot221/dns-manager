import { z } from "zod";
import { createDataAccount } from "@/lib/users/create";
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
    const users = isLocalDemo() ? await demoUsers((items) => items.map((user) => ({ ...user, portalIdentifier: user.id === "dev-owner" ? "115502532" : user.portalIdentifier, zoneAdmin: false, units: [] }))) : (await db.user.findMany({ where: { removedAt: null }, select: { unitMemberships: { select: { unit: { select: { id: true, name: true } } } }, name: true, id: true, studentId: true, logtoName: true, portalEmail: true, note: true, accounts: { where: { provider: { in: ["ncu-portal", "logto"] } }, select: { provider: true, providerAccountId: true } }, email: true, globalRole: true, disabled: true, createdAt: true, zonePermissions: { where: { role: "ADMIN" }, select: { id: true } }, groupMemberships: { select: { group: { select: { zonePermissions: { where: { role: "ADMIN" }, select: { id: true } } } } } } } })).map(({ zonePermissions, groupMemberships, unitMemberships, ...user }) => ({ ...user, units: unitMemberships.map((membership) => membership.unit), zoneAdmin: !!zonePermissions.length || groupMemberships.some((item) => item.group.zonePermissions.length > 0) }));
    return Response.json({ users: users.map((user) => ({ ...accountPresentation(user), units: user.units })), canAssignAdmin: isGlobalAdmin(actor), canRemoveUsers: isOwner(actor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
async function POSTHandler(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可建立使用者。", 403);
    const input = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().toLowerCase().max(320).pipe(z.union([z.email(), z.literal("")])).default(""), note: z.string().trim().max(1000).default(""), unitId: z.string().min(1).max(100).optional() }).strict().parse(await request.json());
    const user = await createDataAccount(actor, input);
    return Response.json({ user: accountPresentation(user) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export const POST = auditMutation(POSTHandler);
