import "server-only";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/api/respond";
import { isGlobalAdmin } from "@/lib/auth/owner";
import type { Actor } from "@/lib/dns/types";
import { isCurrentUnitAdmin, lockActiveUser, lockUnit, unitAudit } from "@/lib/units/service";

export async function createDataAccount(actor: Actor, input: { name: string; email: string; note: string; unitId?: string }) {
  if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可新增資料帳號。", 403);
  if (!process.env.DATABASE_URL) throw new ApiError("新增資料帳號需要資料庫環境。", 503);
  return db.$transaction(async (tx) => {
    await lockActiveUser(tx, actor.id);
    if (!await isCurrentUnitAdmin(tx, actor)) throw new ApiError("管理員權限已變更，請重新登入。", 403);
    if (input.unitId) await lockUnit(tx, input.unitId);
    const user = await tx.user.create({ data: {
      name: input.name, email: `contact-${crypto.randomUUID()}@accounts.invalid`, portalEmail: input.email || null,
      note: input.note, disabled: true, globalRole: "USER", passwordHash: null,
      ...(input.unitId ? { unitMemberships: { create: { unitId: input.unitId, role: "EDITOR" } } } : {}),
    } });
    await unitAudit(tx, actor, "CREATE_DATA_ACCOUNT", null, { id: user.id, name: user.name, email: user.portalEmail, unitId: input.unitId ?? null, dataOnly: true });
    return user;
  });
}
