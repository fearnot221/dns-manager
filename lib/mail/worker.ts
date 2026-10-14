import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { MailDelivery } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readMailSettings } from "./settings";

const maxAttempts = 5;
export function safeMailError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "EAUTH") return "Google 驗證失敗，請檢查來源 IP 白名單與寄件網域設定。";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(code || "")) return "無法連線至 Google SMTP，請檢查網路與 TLS 設定。";
  return "寄送未完成，請檢查 Google SMTP 驗證設定、寄件地址及收件地址。";
}
/** Atomic lease claims allow more than one worker; expired leases recover after a crash. */
export async function claimDelivery() {
  const token = randomUUID();
  await db.mailDelivery.updateMany({ where: { status: "SENDING", leaseUntil: { lt: new Date() }, attempts: { gte: maxAttempts } }, data: { status: "FAILED", leaseUntil: null, leaseToken: null, lastError: "工作中斷且已達重試上限；重寄前請確認收件狀態。" } });
  const rows = await db.$queryRaw<MailDelivery[]>`
    WITH next AS (
      SELECT "id" FROM "MailDelivery"
      WHERE "attempts" < ${maxAttempts} AND
        (("status" = 'PENDING' AND "availableAt" <= NOW()) OR ("status" = 'SENDING' AND "leaseUntil" < NOW()))
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "MailDelivery" AS m SET "status" = 'SENDING', "attempts" = m."attempts" + 1,
      "leaseToken" = ${token}, "leaseUntil" = NOW() + INTERVAL '5 minutes'
      FROM next WHERE m."id" = next."id" RETURNING m.*`;
  return rows[0] ?? null;
}
export async function processOneDelivery() {
  const settings = await readMailSettings();
  if (!settings.config.enabled) return false;
  const delivery = await claimDelivery();
  if (!delivery) return false;
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  let sent = false;
  let errorMessage: string | null = null;
  try {
    transport = nodemailer.createTransport({
      host: settings.config.host, port: settings.config.port, secure: settings.config.port === 465,
      requireTLS: true, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      from: { name: delivery.fromName, address: delivery.fromEmail }, to: delivery.recipient,
      subject: delivery.subject, text: delivery.text,
      messageId: `<${delivery.id}@${delivery.fromEmail.split("@")[1]}>`,
    });
    sent = result.accepted.length > 0;
    if (!sent) errorMessage = "Google SMTP 未接受收件地址。";
  } catch (error) { errorMessage = safeMailError(error); }
  finally { transport?.close(); }
  // Database failures after SMTP success must leave the lease intact, not immediately requeue.
  await db.mailDelivery.updateMany({ where: { id: delivery.id, leaseToken: delivery.leaseToken, status: "SENDING" }, data: {
    status: sent ? "SENT" : delivery.attempts >= maxAttempts ? "FAILED" : "PENDING",
    sentAt: sent ? new Date() : null, lastError: errorMessage,
    availableAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** (delivery.attempts - 1))), leaseUntil: null, leaseToken: null,
  } });
  return true;
}
