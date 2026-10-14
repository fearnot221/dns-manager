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
import { customSample, manualMessageSchema, renderMail, scenarioKeys, scenarios } from "@/lib/mail/model";
import { enqueueManualMail, unitAdministrators } from "@/lib/mail/queue";
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
    const units = await unitAdministrators(db);
    return Response.json({ settings, deliveries, units }, { headers });
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
  z.object({ action: z.literal("test"), recipient: z.string().max(254).email(), template: z.string().max(60).optional(), expectedRevision: z.string().uuid() }).strict(),
  z.object({ action: z.literal("send"), unitIds: z.array(z.string().min(1).max(100)).min(1, "請選擇單位").max(500), subject: z.string(), body: z.string(), ccTeam: z.boolean() }).strict(),
  z.object({ action: z.literal("retry"), id: z.string().min(1).max(100) }).strict(),
]);
export const POST = auditMutation(async (request: Request) => {
  try {
    assertSameOrigin(request);
    const actor = await admin();
    const input = actionSchema.parse(await request.json());
    if (!await consumeBudgets([{ key: `mail-actions:${actor.id}`, limit: 5, windowMs: 60000 }])) throw new ApiError("操作過於頻繁，請稍後再試。", 429);
    const queued = await db.$transaction(async tx => {
      const settings = await readMailSettings(tx);
      if (!settings.config.enabled) throw new ApiError("請先儲存並啟用郵件設定。", 400);
      let count = 1;
      if (input.action === "test") {
        if (settings.revision !== input.expectedRevision) throw new ApiError("設定已變更，請重新載入後再測試。", 409);
        const key = input.template ?? "requestCreate";
        const custom = settings.config.customTemplates.find(item => `custom:${item.id}` === key);
        const scenario = (scenarioKeys as readonly string[]).includes(key) ? scenarios[key as keyof typeof scenarios] : null;
        if (!custom && !scenario) throw new ApiError("找不到此模板，請重新載入。", 404);
        const message = renderMail(custom ?? settings.config.templates[key as keyof typeof scenarios], custom ? customSample : scenario!.sample);
        await tx.mailDelivery.create({ data: { eventKey: `test:${randomUUID()}`, recipient: input.recipient, fromEmail: settings.config.fromEmail, fromName: settings.config.fromName, subject: `[測試] ${message.subject}`, text: message.text } });
      } else if (input.action === "send") {
        const parsed = manualMessageSchema.safeParse(input);
        if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "郵件內容格式錯誤", 400);
        count = await enqueueManualMail(tx, randomUUID(), { ...input, ...parsed.data });
        if (!count) throw new ApiError("選取的單位沒有可寄送的管理員信箱。", 400);
      } else {
        const result = await tx.mailDelivery.updateMany({ where: { id: input.id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, lastError: null, availableAt: new Date(), leaseUntil: null, leaseToken: null } });
        if (!result.count) throw new ApiError("只有寄送失敗的郵件可以重試，請重新整理。", 409);
      }
      const audit = input.action === "send" ? { action: "send", unitIds: input.unitIds, subject: input.subject, ccTeam: input.ccTeam, count } : input;
      await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: "", action: input.action === "test" ? "TEST_MAIL" : input.action === "send" ? "SEND_UNIT_MAIL" : "RETRY_MAIL", success: true, newValue: audit } });
      return count;
    });
    return Response.json({ queued }, { headers });
  } catch (error) { return failure(error); }
});
