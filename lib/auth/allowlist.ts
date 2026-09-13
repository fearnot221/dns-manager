import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { OWNER_EMAIL } from "./owner";

export const allowlistEmail = z.string().trim().toLowerCase().pipe(z.email().max(254)).refine((email) => !email.includes("*"), "不支援萬用字元");
const prefix = "portal-allowlist:";
export type AllowlistEntry = { email: string; addedBy: string; addedAt: string; protected: boolean };
const ownerEntry: AllowlistEntry = { email: OWNER_EMAIL, addedBy: "system", addedAt: "", protected: true };
type Store = { entries: Record<string, AllowlistEntry> };

export async function portalEmailAllowed(value: unknown): Promise<boolean> {
  const parsed = allowlistEmail.safeParse(value);
  if (!parsed.success) return false;
  if (parsed.data === OWNER_EMAIL) return true; // Built-in, protected allowlist member.
  if (isLocalDemo()) return localDocument<Store, boolean>("portal-allowlist", async () => ({ entries: {} }), (data) => !!data.entries[parsed.data]);
  return !!await db.systemSetting.findUnique({ where: { key: prefix + parsed.data }, select: { key: true } });
}

export async function listPortalAllowlist(): Promise<AllowlistEntry[]> {
  const entries = isLocalDemo()
    ? await localDocument<Store, AllowlistEntry[]>("portal-allowlist", async () => ({ entries: {} }), (data) => Object.values(data.entries))
    : (await db.systemSetting.findMany({ where: { key: { startsWith: prefix } } })).map((row) => row.value as unknown as AllowlistEntry);
  return [ownerEntry, ...entries.filter((entry) => entry.email !== OWNER_EMAIL).sort((a, b) => a.email.localeCompare(b.email))];
}

export async function changePortalAllowlist(email: string, actorEmail: string, remove: boolean) {
  email = allowlistEmail.parse(email);
  if (email === OWNER_EMAIL) throw new Error("Protected allowlist entry");
  const entry: AllowlistEntry = { email, addedBy: actorEmail, addedAt: new Date().toISOString(), protected: false };
  if (isLocalDemo()) return localDocument<Store, void>("portal-allowlist", async () => ({ entries: {} }), (data) => {
    if (remove) delete data.entries[email]; else data.entries[email] ??= entry;
  }, true);
  if (remove) await db.systemSetting.deleteMany({ where: { key: prefix + email } });
  else await db.systemSetting.upsert({ where: { key: prefix + email }, create: { key: prefix + email, value: entry }, update: {} });
}
