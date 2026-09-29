import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { ApiError } from "@/lib/api/respond";
import { isOwner } from "@/lib/auth/owner";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/dns/types";

const key = "dns-deletion-protection";
const windowMs = 15 * 60 * 1000;
type Attempts = { count: number; resetAt: number };
type Settings = { passwordHash: string | null; updatedAt: string | null };
type LocalState = Settings & { attempts: Record<string, Attempts> };
const initial = async (): Promise<LocalState> => ({ passwordHash: null, updatedAt: null, attempts: {} });
export const deletionPasswordSchema = z.string().max(256).optional();
export const deletionSettingsSchema = z.object({ password: z.string().min(12).max(256), confirmation: z.string().min(12).max(256), expectedUpdatedAt: z.iso.datetime().nullable() }).strict().refine((v) => v.password === v.confirmation, { message: "兩次密碼不一致", path: ["confirmation"] });

async function readSettings(): Promise<Settings> {
  if (isLocalDemo()) return localDocument(key, initial, ({ passwordHash, updatedAt }) => ({ passwordHash, updatedAt }));
  const saved = await db.systemSetting.findUnique({ where: { key } });
  return { passwordHash: saved ? z.object({ passwordHash: z.string() }).parse(saved.value).passwordHash : null, updatedAt: saved?.updatedAt.toISOString() ?? null };
}
export async function deletionProtectionStatus() {
  const saved = await readSettings();
  return { configured: !!saved.passwordHash, updatedAt: saved.updatedAt };
}
export async function saveDeletionPassword(actor: Actor, value: unknown) {
  if (!isOwner(actor)) throw new ApiError("只有最高管理員可以設定刪除保護密碼。", 403);
  const input = deletionSettingsSchema.parse(value);
  const passwordHash = await hashPassword(input.password);
  const check = (updatedAt: string | null) => { if (updatedAt !== input.expectedUpdatedAt) throw new ApiError("設定已被修改，請重新載入。", 409); };
  if (isLocalDemo()) return localDocument(key, initial, (data) => {
    check(data.updatedAt);
    data.passwordHash = passwordHash;
    data.updatedAt = new Date(Math.max(Date.now(), Date.parse(data.updatedAt ?? "") + 1 || 0)).toISOString();
    return { configured: true, updatedAt: data.updatedAt };
  }, true);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const before = await tx.systemSetting.findUnique({ where: { key } });
    check(before?.updatedAt.toISOString() ?? null);
    const updatedAt = new Date(Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1));
    await tx.systemSetting.upsert({ where: { key }, create: { key, value: { passwordHash }, updatedAt }, update: { value: { passwordHash }, updatedAt } });
    return { configured: true, updatedAt: updatedAt.toISOString() };
  });
}

/** Verify on every destructive request; never issue a reusable browser unlock token. */
export async function assertDeletionPassword(actor: Actor, input: unknown) {
  const password = deletionPasswordSchema.parse(input);
  if (!password) throw new ApiError("請輸入刪除保護密碼。", 403);
  const check = async (settings: Settings, previous?: Attempts) => {
    if (!settings.passwordHash) return { error: new ApiError("尚未設定刪除保護密碼，請聯絡最高管理員。", 409) };
    const attempts = previous && previous.resetAt > Date.now() ? previous : { count: 0, resetAt: Date.now() + windowMs };
    if (attempts.count >= 5) return { error: new ApiError("密碼錯誤次數過多，請於 15 分鐘後重試。", 429), attempts };
    if (await verifyPassword(password, settings.passwordHash)) return { attempts: { count: 0, resetAt: 0 } };
    return { error: new ApiError("刪除保護密碼不正確。", 403), attempts: { ...attempts, count: attempts.count + 1 } };
  };
  // Commit failed attempts before throwing, including when a caller rolls back its DNS transaction.
  const result = isLocalDemo() ? await localDocument(key, initial, async (data) => {
    const result = await check(data, data.attempts[actor.id]);
    if (result.attempts) data.attempts[actor.id] = result.attempts;
    return result;
  }, true) : await db.$transaction(async (tx) => {
    const attemptKey = `${key}:attempts:${actor.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attemptKey}, 0))::text`;
    const saved = await tx.systemSetting.findUnique({ where: { key } });
    const previous = await tx.systemSetting.findUnique({ where: { key: attemptKey } });
    const result = await check({ passwordHash: saved ? z.object({ passwordHash: z.string() }).parse(saved.value).passwordHash : null, updatedAt: null }, previous?.value as Attempts | undefined);
    if (result.attempts) await tx.systemSetting.upsert({ where: { key: attemptKey }, create: { key: attemptKey, value: result.attempts }, update: { value: result.attempts } });
    return result;
  });
  if (result.error) throw result.error;
}
