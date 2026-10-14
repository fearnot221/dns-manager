import "server-only";
import type { Prisma } from "@prisma/client";
import { readMailSettings } from "./settings";
import { renderMail, type MailVariables } from "./model";

export function reviewUrl() {
  const origin = new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000");
  return new URL("/requests", origin).href;
}
export async function enqueueDnsMail(tx: Prisma.TransactionClient, eventKey: string, values: Omit<MailVariables, "submittedAt" | "reviewUrl">) {
  const { config } = await readMailSettings(tx);
  if (!config.enabled) return;
  const message = renderMail(config, { ...values, submittedAt: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) + "（台北時間）", reviewUrl: reviewUrl() });
  await tx.mailDelivery.createMany({ data: config.recipients.map(recipient => ({ eventKey, recipient, fromEmail: config.fromEmail, fromName: config.fromName, ...message })), skipDuplicates: true });
}
