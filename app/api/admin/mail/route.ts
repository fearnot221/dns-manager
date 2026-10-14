import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { assertSameOrigin } from "@/lib/api/security";
import { apiError, ApiError } from "@/lib/api/respond";
import { auditMutation } from "@/lib/audit/mutation";
import { db } from "@/lib/db/client";
import { consumeBudgets } from "@/lib/security/rate-limit";
import { MailSettingsError, publicMailSettings, readMailSettings, saveMailSettings } from "@/lib/mail/settings";
import { renderMail, sampleMailVariables } from "@/lib/mail/model";
import { reviewUrl } from "@/lib/mail/queue";
const headers = { "Cache-Control": "private, no-store" };
async function admin() {
  const actor = await requireActor();
  if (!isGlobalAdmin(actor)) throw new ApiError("只有系統管理員可以管理郵件服務。", 403);
  return actor;
}
function failure(error: unknown) { return apiError(error instanceof MailSettingsError ? new ApiError(error.message, error.status) : error); }
export async function GET() {
  try {
    await admin();
    const settings = publicMailSettings(await readMailSettings());
    const deliveries = await db.mailDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, eventKey: true, recipient: true, subject: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true } });
    return Response.json({ settings, deliveries }, { headers });
  } catch (error) { return failure(error); }
}
export const PUT = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await admin();
    return Response.json(await saveMailSettings(await request.json(), actor), { headers });
  } catch (error) { return failure(error); }
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), recipient: z.string().max(254).email(), expectedRevision: z.string().uuid() }).strict(),
  z.object({ action: z.literal("retry"), id: z.string().min(1).max(100) }).strict(),
]);
export const POST = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await admin();
    const input = actionSchema.parse(await request.json());
    if (!await consumeBudgets([{ key: `mail-actions:${actor.id}`, limit: 5, windowMs: 60000 }])) throw new ApiError("操作過於頻繁，請稍後再試。", 429);
    await db.$transaction(async tx => {
      const settings = await readMailSettings(tx);
      if (!settings.config.enabled) throw new ApiError("請先儲存並啟用郵件設定。", 400);
      if (input.action === "test") {
        if (settings.revision !== input.expectedRevision) throw new ApiError("設定已變更，請重新載入後再測試。", 409);
        const message = renderMail(settings.config, { ...sampleMailVariables, reviewUrl: reviewUrl() });
        await tx.mailDelivery.create({ data: { eventKey: `test:${randomUUID()}`, recipient: input.recipient, fromEmail: settings.config.fromEmail, fromName: settings.config.fromName, subject: `[測試] ${message.subject}`, text: message.text } });
      } else {
        const result = await tx.mailDelivery.updateMany({ where: { id: input.id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, lastError: null, availableAt: new Date(), leaseUntil: null, leaseToken: null } });
        if (!result.count) throw new ApiError("只有寄送失敗的郵件可以重試，請重新整理。", 409);
      }
      await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: "", action: input.action === "test" ? "TEST_MAIL" : "RETRY_MAIL", success: true, newValue: input } });
    });
    return Response.json({ queued: true }, { headers });
  } catch (error) { return failure(error); }
});
