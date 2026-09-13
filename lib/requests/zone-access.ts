import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { connectionEnvironment } from "@/lib/powerdns/settings";
import { normalizeZoneName } from "@/lib/dns/names";
import { ApiError } from "@/lib/api/respond";

export type ZoneApplicationAccess = { enabled: boolean; updatedAt: string | null; updatedBy: string | null };
type Store = { settings: Record<string, ZoneApplicationAccess> };
export const closedAccess: ZoneApplicationAccess = { enabled: false, updatedAt: null, updatedBy: null };
async function prefix() {
  const env = await connectionEnvironment();
  const scope = env.PDNS_MOCK === "true" ? "local-mock" : `${env.PDNS_API_URL}|${env.PDNS_SERVER_ID || "localhost"}`;
  return `zone-application:${createHash("sha256").update(scope).digest("hex")}:`;
}
export async function zoneApplicationAccess(): Promise<Record<string, ZoneApplicationAccess>> {
  const scope = await prefix();
  const entries = isLocalDemo()
    ? Object.entries(await localDocument<Store, Store["settings"]>("zone-applications", async () => ({ settings: {} }), (data) => data.settings)).filter(([key]) => key.startsWith(scope))
    : (await db.systemSetting.findMany({ where: { key: { startsWith: scope } } })).map((row) => [row.key, row.value as unknown as ZoneApplicationAccess] as const);
  return Object.fromEntries(entries.map(([key, value]) => [key.slice(scope.length), value]));
}
export async function applicationZoneNames(names: string[]) {
  const access = await zoneApplicationAccess();
  return [...new Set(names.map(normalizeZoneName))].filter((name) => access[name]?.enabled === true).sort();
}
export async function setZoneApplicationAccess(zone: string, enabled: boolean, expectedUpdatedAt: string | null, actorEmail: string) {
  const key = await prefix() + normalizeZoneName(zone);
  const update = (previous: ZoneApplicationAccess) => {
    if (previous.updatedAt !== expectedUpdatedAt) throw new ApiError("此網域的申請設定已變更，請重新整理後再試。", 409);
    return { enabled, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString(), updatedBy: actorEmail };
  };
  if (isLocalDemo()) return localDocument<Store, { before: ZoneApplicationAccess; after: ZoneApplicationAccess }>("zone-applications", async () => ({ settings: {} }), (data) => {
    const before = data.settings[key] ?? closedAccess;
    const after = update(before); data.settings[key] = after; return { before, after };
  }, true);
  return db.$transaction(async (tx) => {
    const saved = await tx.systemSetting.findUnique({ where: { key } });
    const before = saved ? saved.value as unknown as ZoneApplicationAccess : closedAccess;
    const after = update(before);
    await tx.systemSetting.upsert({ where: { key }, create: { key, value: after }, update: { value: after } });
    return { before, after };
  }, { isolationLevel: "Serializable" });
}
