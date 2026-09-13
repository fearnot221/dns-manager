import "server-only";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
type Store = { sessions: Record<string, number> };
export async function createIdleSession(id: string, userId: string, now = Date.now()) {
  const expires = now + IDLE_TIMEOUT_MS;
  if (isLocalDemo()) await localDocument<Store, void>("idle-sessions", async () => ({ sessions: {} }), (store) => {
    for (const key of Object.keys(store.sessions)) if (store.sessions[key] <= now) delete store.sessions[key];
    store.sessions[id] = expires;
  }, true);
  else await db.session.create({ data: { sessionToken: id, userId, expires: new Date(expires) } });
  return expires;
}
export async function readIdleSession(id: unknown, now = Date.now()): Promise<number | null> {
  if (typeof id !== "string" || !id) return null;
  const expires = isLocalDemo()
    ? await localDocument<Store, number | undefined>("idle-sessions", async () => ({ sessions: {} }), (store) => store.sessions[id])
    : (await db.session.findUnique({ where: { sessionToken: id }, select: { expires: true } }))?.expires.getTime();
  return expires && expires > now ? expires : null;
}
export async function touchIdleSession(id: string, now = Date.now()): Promise<number | null> {
  const expires = now + IDLE_TIMEOUT_MS;
  if (isLocalDemo()) return localDocument<Store, number | null>("idle-sessions", async () => ({ sessions: {} }), (store) => {
    if (!store.sessions[id] || store.sessions[id] <= now) return null;
    store.sessions[id] = expires; return expires;
  }, true);
  // Atomic condition prevents a late heartbeat from reviving an expired session.
  const result = await db.session.updateMany({ where: { sessionToken: id, expires: { gt: new Date(now) } }, data: { expires: new Date(expires) } });
  return result.count ? expires : null;
}
export async function revokeIdleSession(id: string) {
  if (isLocalDemo()) await localDocument<Store, void>("idle-sessions", async () => ({ sessions: {} }), (store) => { delete store.sessions[id]; }, true);
  else await db.session.deleteMany({ where: { sessionToken: id } });
}
