import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: { session: { updateMany: vi.fn() } } }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: vi.fn(() => true), localDocument: vi.fn() }));
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { db } from "@/lib/db/client";
import { createIdleSession, readIdleSession, touchIdleSession, revokeIdleSession, IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(isLocalDemo).mockReturnValue(true);
  const documents: Record<string, unknown> = {};
  let queue: Promise<unknown> = Promise.resolve();
  vi.mocked(localDocument).mockImplementation((name, initial, operation) => {
    const next = queue.then(async () => { documents[name] ??= await initial(); return operation(documents[name]); });
    queue = next.catch(() => undefined); return next;
  });
});
it("expires at exactly 15 minutes, and reads never extend the deadline", async () => {
  expect(IDLE_TIMEOUT_MS).toBe(900000);
  await createIdleSession("s", "u", 1000);
  expect(await readIdleSession("s", 900999)).toBe(901000);
  expect(await readIdleSession("s", 901000)).toBeNull();
  expect(await touchIdleSession("s", 901000)).toBeNull();
});
it("only activity extends a live session and sign-out revokes it", async () => {
  await createIdleSession("s", "u", 1000);
  expect(await touchIdleSession("s", 60000)).toBe(960000);
  expect(await readIdleSession("s", 901000)).toBe(960000);
  await revokeIdleSession("s");
  expect(await readIdleSession("s", 902000)).toBeNull();
  expect(await readIdleSession(undefined)).toBeNull();
});
it("does not extend another browser session", async () => {
  await createIdleSession("one", "u", 1000); await createIdleSession("two", "u", 1000);
  await touchIdleSession("one", 900000);
  expect(await readIdleSession("two", 901000)).toBeNull();
  expect(await readIdleSession("one", 901000)).toBe(1800000);
});
it("uses an atomic database condition to prevent resurrection", async () => {
  vi.mocked(isLocalDemo).mockReturnValue(false);
  vi.mocked(db.session.updateMany).mockResolvedValue({ count: 0 });
  expect(await touchIdleSession("expired", 1000)).toBeNull();
  expect(db.session.updateMany).toHaveBeenCalledWith({ where: { sessionToken: "expired", expires: { gt: new Date(1000) } }, data: { expires: new Date(901000) } });
});
