import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error { status = 401; } }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/powerdns/client", () => ({ powerdns: { listZones: vi.fn(), getZone: vi.fn() } }));
vi.mock("@/lib/requests/zone-access", () => ({ zoneApplicationAccess: async () => ({}), closedAccess: { enabled: false } }));
import { requireActor } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { GET as list } from "@/app/api/zones/route";
import { GET as detail } from "@/app/api/zones/[zone]/route";
import type { Actor, Zone } from "@/lib/dns/types";
const user: Actor = { id: "u", email: "u@example.com", globalRole: "USER", zoneRoles: {} };
const zone = { name: "example.com.", rrsets: [] } as unknown as Zone;
const get = () => detail(new Request("http://localhost:3000/api/zones/example.com"), { params: Promise.resolve({ zone: "example.com" }) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireActor).mockResolvedValue(user); vi.mocked(powerdns.getZone).mockResolvedValue(zone); vi.mocked(powerdns.listZones).mockResolvedValue([zone, { ...zone, name: "private.test." }]); });
it("blocks personal users and legacy zone editors before querying PowerDNS", async () => {
  for (const zoneRoles of [{}, { "example.com.": "EDITOR" }, { "example.com.": "VIEWER" }] as Actor["zoneRoles"][]) {
    vi.mocked(requireActor).mockResolvedValue({ ...user, zoneRoles });
    expect((await list()).status).toBe(403);
    expect((await get()).status).toBe(404);
  }
  expect(powerdns.listZones).not.toHaveBeenCalled();
  expect(powerdns.getZone).not.toHaveBeenCalled();
});
it("limits delegated admins to assigned zones", async () => {
  vi.mocked(requireActor).mockResolvedValue({ ...user, zoneRoles: { "example.com.": "ADMIN" } });
  expect((await (await list()).json()).zones.map((entry: Zone) => entry.name)).toEqual(["example.com."]);
  expect((await (await get()).json()).permission).toBe("ADMIN");
  vi.mocked(requireActor).mockResolvedValue({ ...user, zoneRoles: { "other.test.": "ADMIN" } });
  expect((await get()).status).toBe(404);
});
it("returns the effective role for global administrators without per-zone grants", async () => {
  for (const globalRole of ["ADMIN", "SUPER_ADMIN"] as const) {
    vi.mocked(requireActor).mockResolvedValue({ ...user, globalRole });
    expect((await (await get()).json()).permission).toBe(globalRole);
  }
});
