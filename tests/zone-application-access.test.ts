import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ AuthError: class extends Error {} }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
const state = vi.hoisted(() => ({ settings: {}, env: { PDNS_MOCK: "true" } as Record<string, string> }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true, localDocument: async (_name: string, _initial: unknown, fn: (data: unknown) => unknown) => fn(state) }));
vi.mock("@/lib/powerdns/settings", () => ({ connectionEnvironment: async () => state.env }));
import { applicationZoneNames, setZoneApplicationAccess } from "@/lib/requests/zone-access";
beforeEach(() => { state.settings = {}; state.env = { PDNS_MOCK: "true" }; });
it("defaults closed, normalizes names, and only exposes existing enabled zones", async () => {
  expect(await applicationZoneNames(["example.com"])).toEqual([]);
  await setZoneApplicationAccess("EXAMPLE.COM", true, null, "admin@example.com");
  expect(await applicationZoneNames(["example.com", "example.com.", "private.test"])).toEqual(["example.com."]);
  expect(await applicationZoneNames([])).toEqual([]);
});
it("records actor, supports closing and rejects stale changes", async () => {
  const first = await setZoneApplicationAccess("example.com", true, null, "admin@example.com");
  expect(first.before.enabled).toBe(false);
  expect(first.after.updatedBy).toBe("admin@example.com");
  await expect(setZoneApplicationAccess("example.com", false, null, "other@example.com")).rejects.toMatchObject({ status: 409 });
  await setZoneApplicationAccess("example.com", false, first.after.updatedAt, "admin@example.com");
  expect(await applicationZoneNames(["example.com"])).toEqual([]);
});
it("isolates settings when the PowerDNS connection changes", async () => {
  await setZoneApplicationAccess("example.com", true, null, "admin@example.com");
  state.env = { PDNS_API_URL: "https://dns.example/api/v1", PDNS_SERVER_ID: "localhost" };
  expect(await applicationZoneNames(["example.com"])).toEqual([]);
});
