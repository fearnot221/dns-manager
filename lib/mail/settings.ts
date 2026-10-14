import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { defaultMailConfig, mailConfigSchema, mailSaveSchema, type MailConfig, type PublicMailSettings } from "./model";

export const mailSettingsKey = "mail.settings.v1";
export class MailSettingsError extends Error { constructor(message: string, public status = 400) { super(message); } }
type StoredSettings = { config: MailConfig; revision: string | null };
export async function readMailSettings(client: Pick<Prisma.TransactionClient, "systemSetting"> = db): Promise<StoredSettings> {
  const row = await client.systemSetting.findUnique({ where: { key: mailSettingsKey } });
  if (!row) return { config: defaultMailConfig, revision: null };
  const value = row.value as unknown as StoredSettings;
  return { config: mailConfigSchema.parse(value.config), revision: value.revision };
}
export function publicMailSettings(value: StoredSettings): PublicMailSettings {
  return { config: value.config, revision: value.revision };
}
export async function saveMailSettings(input: unknown, actor: { id: string; email: string }) {
  const parsed = mailSaveSchema.parse(input);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${mailSettingsKey}, 0))::text`;
    const previous = await readMailSettings(tx);
    if (previous.revision !== parsed.expectedRevision) throw new MailSettingsError("設定已被其他管理員更新，請重新載入後再修改。", 409);
    const value = { config: parsed.config, revision: randomUUID() };
    await tx.systemSetting.upsert({ where: { key: mailSettingsKey }, create: { key: mailSettingsKey, value }, update: { value } });
    await tx.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, zone: "", action: "UPDATE_MAIL_SETTINGS", success: true, newValue: { enabled: value.config.enabled, revision: value.revision } } });
    return publicMailSettings(value);
  });
}
