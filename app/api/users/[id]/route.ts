import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isOwner, mayManageUser } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { demoUsers } from "@/lib/users/demo";
import { isLocalDemo } from "@/lib/db/local-store";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { logAuditEvent } from "@/lib/audit/service";
const schema = z.object({ name: z.string().trim().min(1).max(100).optional(), disabled: z.boolean().optional(), globalRole: z.enum(["USER", "ADMIN"]).optional() }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireActor(); const { id } = await params;
    const input = schema.parse(await request.json());
    if (input.globalRole !== undefined && !isOwner(actor)) throw new ApiError("只有最高使用者可以指派或移除管理員。", 403);
    const check = (user: { email: string; globalRole: "USER" | "ADMIN" | "SUPER_ADMIN"; zoneAdmin?: boolean }) => { if (!mayManageUser(actor, user)) throw new ApiError("此帳號受保護，無法修改。", 403); };
    const user = isLocalDemo() ? await demoUsers((users) => { const user = users.find((u) => u.id === id); if (!user) throw new ApiError("找不到使用者。", 404); check(user); Object.assign(user, input); return user; }, true) : await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, include: { zonePermissions: true, groupMemberships: { include: { group: { include: { zonePermissions: true } } } } } });
      if (!user) throw new ApiError("找不到使用者。", 404);
      check({ ...user, zoneAdmin: [...user.zonePermissions, ...user.groupMemberships.flatMap((m) => m.group.zonePermissions)].some((p) => p.role === "ADMIN") });
      return tx.user.update({ where: { id }, data: input });
    }, { isolationLevel: "Serializable" });
    await logAuditEvent({ actor, zone: "", action: "UPDATE_USER", after: { id, ...input }, success: true, request });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole, disabled: user.disabled } });
  } catch (error) { return apiError(error); }
}
