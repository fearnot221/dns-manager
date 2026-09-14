import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { assertSameOrigin } from "@/lib/api/security";
import { apiError } from "@/lib/api/respond";
import { auditMutation } from "@/lib/audit/mutation";
import { publicContact, publicUserSelect, requireWorkflowDatabase, sendContact, replyContact } from "@/lib/workflows/service";
export async function GET() { try { const actor = await requireActor(); requireWorkflowDatabase(); const messages = await db.contactMessage.findMany({ where: isGlobalAdmin(actor) ? {} : { userId: actor.id }, include: { user: { select: publicUserSelect } }, orderBy: { createdAt: "desc" } }); return Response.json({ messages: messages.map(({ user, ...message }) => ({ ...message, user: publicContact(user) })) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
export const POST = auditMutation(async (request: Request) => { try { assertSameOrigin(request); const actor = await requireActor(); const input = z.object({ subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(5000) }).strict().parse(await request.json()); return Response.json({ message: await sendContact(actor, input) }, { status: 201 }); } catch (error) { return apiError(error); } });
export const PATCH = auditMutation(async (request: Request) => { try { assertSameOrigin(request); const actor = await requireActor(); const input = z.object({ id: z.string().min(1).max(100), reply: z.string().trim().min(1).max(5000) }).strict().parse(await request.json()); await replyContact(actor, input.id, input.reply); return Response.json({ saved: true }); } catch (error) { return apiError(error); } });
