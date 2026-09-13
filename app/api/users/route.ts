import { auditMutation } from "@/lib/audit/mutation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin, isOwner, isOwnerEmail, resolvedGlobalRole } from "@/lib/auth/owner";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { isLocalDemo } from "@/lib/db/local-store";
import { demoUsers } from "@/lib/users/demo";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { logAuditEvent } from "@/lib/audit/service";

const createSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()), name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128), globalRole: z.enum(["USER", "ADMIN"]).default("USER") }).strict();
export async function GET() {
  try {
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可管理使用者。", 403);
    const users = isLocalDemo() ? await demoUsers((items) => items.map(({ id, name, email, globalRole, disabled, createdAt }) => ({ id, name, email, globalRole, disabled, createdAt, zoneAdmin: false }))) : (await db.user.findMany({ select: { id: true, name: true, email: true, globalRole: true, disabled: true, createdAt: true, zonePermissions: { where: { role: "ADMIN" }, select: { id: true } }, groupMemberships: { select: { group: { select: { zonePermissions: { where: { role: "ADMIN" }, select: { id: true } } } } } } } })).map(({ zonePermissions, groupMemberships, ...user }) => ({ ...user, zoneAdmin: !!zonePermissions.length || groupMemberships.some((item) => item.group.zonePermissions.length > 0) }));
    return Response.json({ users: users.map((user) => ({ ...user, globalRole: resolvedGlobalRole(user.email, user.globalRole), protected: isOwnerEmail(user.email) })), canAssignAdmin: isOwner(actor) });
  } catch (error) { return apiError(error); }
}
async function POSTHandler(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可建立使用者。", 403);
    const input = createSchema.parse(await request.json());
    if (isOwnerEmail(input.email)) throw new ApiError("最高使用者只能透過受信任的初始化程序建立，不能在後台新增或修改。", 403);
    if (input.globalRole === "ADMIN" && !isOwner(actor)) throw new ApiError("只有最高使用者可以新增管理員。", 403);
    const passwordHash = await hashPassword(input.password);
    const data = { email: input.email, name: input.name, globalRole: input.globalRole, passwordHash };
    const user = isLocalDemo() ? await demoUsers((users) => { if (users.some((u) => u.email === input.email)) throw new ApiError("此電子郵件已存在。", 409); const user = { ...data, id: "dev-" + crypto.randomUUID(), disabled: false, createdAt: new Date().toISOString() }; users.push(user); return user; }, true) : await db.user.create({ data });
    await logAuditEvent({ actor, zone: "", action: "CREATE_USER", before: null, after: { id: user.id, email: user.email, name: user.name, disabled: user.disabled, globalRole: user.globalRole, passwordConfigured: true }, success: true, request });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, globalRole: user.globalRole, disabled: user.disabled } }, { status: 201 });
  } catch (error) { if ((error as { code?: string }).code === "P2002") return apiError(new ApiError("此電子郵件已存在。", 409)); return apiError(error); }
}

export const POST = auditMutation(POSTHandler);
