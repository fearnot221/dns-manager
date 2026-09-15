import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { apiError, ApiError } from "@/lib/api/respond";
import { localAuditEvents } from "@/lib/audit/service";
import { redactAudit } from "@/lib/audit/redact";

const schema = z.object({ q: z.string().max(200).default(""), action: z.string().max(100).default(""), status: z.enum(["all", "success", "failed"]).default("all"), page: z.coerce.number().int().min(1).max(10000).default(1) });
export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可檢視系統操作紀錄。", 403);
    const { q, action, status, page } = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const skip = (page - 1) * 50;
    if (!process.env.DATABASE_URL) {
      const events = (await localAuditEvents()).filter((event) => (!action || event.action === action) && (status === "all" || event.success === (status === "success")) && (!q || [event.userName, event.userEmail, event.zone, event.recordName, event.action, event.requestId].some((value) => value?.toLowerCase().includes(q.toLowerCase())))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return Response.json({ events: redactAudit(events.slice(skip, skip + 50)), total: events.length, page });
    }
    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}), ...(status === "all" ? {} : { success: status === "success" }),
      ...(q ? { OR: [{ user: { name: { contains: q, mode: "insensitive" } } }, ...["userEmail", "zone", "recordName", "action", "requestId"].map((field) => ({ [field]: { contains: q, mode: "insensitive" } }))] } : {}),
    };
    const [events, total] = await db.$transaction([db.auditLog.findMany({ where, include: { user: { select: { name: true, studentId: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: 50 }), db.auditLog.count({ where })]);
    return Response.json({ events: redactAudit(events.map(({ user, ...event }) => ({ ...event, userName: user?.name, userDisplayStudentId: user?.studentId }))), total, page });
  } catch (error) { return apiError(error); }
}
