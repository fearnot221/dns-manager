import { auditMutation } from "@/lib/audit/mutation";
import { accountPresentation } from "@/lib/users/presentation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin, isOwner, mayManageUser, OWNER_IDENTIFIER } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { demoUsers } from "@/lib/users/demo";
import { isLocalDemo } from "@/lib/db/local-store";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { logAuditEvent } from "@/lib/audit/service";
const schema = z.object({ note: z.string().trim().max(1000).optional(), disabled: z.boolean().optional(), globalRole: z.enum(["USER", "ADMIN"]).optional() }).strict();
async function PATCHHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let before: unknown;
  try {
    assertSameOrigin(request);
    const actor = await requireActor(); const { id } = await params;
    const input = schema.parse(await request.json());
    const noteOnly = Object.keys(input).length === 1 && typeof input.note === "string";
    if (input.globalRole !== undefined && !isOwner(actor)) throw new ApiError("只有最高使用者可以指派或移除管理員。", 403);
    const check = (user: { email: string; name?: string | null; portalIdentifier?: string | null; note?: string; disabled?: boolean; globalRole: "USER" | "ADMIN" | "SUPER_ADMIN"; zoneAdmin?: boolean }) => {
      const protectedNote = user.portalIdentifier === OWNER_IDENTIFIER && isGlobalAdmin(actor) && noteOnly;
      if (!protectedNote && !mayManageUser(actor, user)) throw new ApiError("此帳號受保護，僅能修改備註。", 403);
      before = { account: user.portalIdentifier || "未綁定 Portal", note: user.note || "", disabled: user.disabled, globalRole: user.globalRole };
    };
    const user = isLocalDemo() ? await demoUsers((users) => { const user = users.find((u) => u.id === id); if (!user) throw new ApiError("找不到使用者。", 404); check({ ...user, portalIdentifier: user.id === "dev-owner" ? "115502532" : user.portalIdentifier }); Object.assign(user, input); return { ...user, portalIdentifier: user.id === "dev-owner" ? OWNER_IDENTIFIER : user.portalIdentifier }; }, true) : await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, include: { accounts: { where: { provider: "ncu-portal" }, select: { providerAccountId: true } }, zonePermissions: true, groupMemberships: { include: { group: { include: { zonePermissions: true } } } } } });
      if (!user) throw new ApiError("找不到使用者。", 404);
      check({ ...user, portalIdentifier: user.accounts[0]?.providerAccountId, zoneAdmin: [...user.zonePermissions, ...user.groupMemberships.flatMap((m) => m.group.zonePermissions)].some((p) => p.role === "ADMIN") });
      return tx.user.update({ where: { id }, data: input, include: { accounts: { where: { provider: "ncu-portal" }, select: { providerAccountId: true } } } });
    }, { isolationLevel: "Serializable" });
    await logAuditEvent({ actor, zone: "", action: "UPDATE_USER", before, after: accountPresentation(user), success: true, request });
    return Response.json({ user: accountPresentation(user) });
  } catch (error) { return apiError(error); }
}

export const PATCH = auditMutation(PATCHHandler);
