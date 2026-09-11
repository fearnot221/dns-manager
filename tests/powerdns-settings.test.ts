import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/local-store", () => ({ isLocalDemo: () => true, localDocument: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
vi.mock("@/lib/audit/service", () => ({ logAuditEvent: vi.fn() }));
import { localDocument } from "@/lib/db/local-store";
import { requireActor } from "@/lib/auth/session";
import { connectionEnvironment, encryptKey, readConnection, saveConnection, savedKeyFor, validateApiUrl } from "@/lib/powerdns/settings";
import { PowerDNSClient } from "@/lib/powerdns/client";
import { GET, POST, PUT } from "@/app/api/admin/powerdns/route";
let documents: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); documents = {};
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "ab".repeat(32)); vi.stubEnv("PDNS_MOCK", "true"); vi.stubEnv("PDNS_ALLOWED_ORIGINS", "http://127.0.0.1:8081");
  vi.mocked(localDocument).mockImplementation(async (name, initial, operation) => { documents[name] ??= await initial(); return operation(documents[name]); });
  vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const apiUrl = "http://127.0.0.1:8081/api/v1";
const input = { apiUrl, serverId: "localhost", apiKey: "test-only-secret" };
const request = (body: unknown, method = "PUT") => new Request("http://localhost/api/admin/powerdns", { method, headers: { Origin: "http://localhost" }, body: JSON.stringify(body) });
describe("PowerDNS connection security", () => {
  it("only permits explicitly allowed origins and canonical API paths", () => {
    expect(validateApiUrl(apiUrl + "/")).toBe(apiUrl);
    for (const value of ["http://169.254.169.254/api/v1", "https://untrusted.example/api/v1", apiUrl + "?key=secret", apiUrl + "#secret", "http://user:pass@127.0.0.1:8081/api/v1", "file:///api/v1"]) expect(() => validateApiUrl(value)).toThrow();
  });
  it("encrypts saved keys and never reuses them for another target", async () => {
    const encryptedKey = await encryptKey(input.apiKey); expect(encryptedKey).not.toContain(input.apiKey);
    await saveConnection({ apiUrl, serverId: "localhost", encryptedKey, updatedAt: new Date().toISOString(), updatedBy: "admin@example.com" });
    expect(await savedKeyFor(apiUrl, "localhost")).toBe(input.apiKey);
    expect(await savedKeyFor(apiUrl, "other")).toBe(""); expect(await savedKeyFor("http://localhost:8081/api/v1", "localhost")).toBe("");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "cd".repeat(32)); await expect(savedKeyFor(apiUrl, "localhost")).rejects.toThrow("無法解密");
  });
  it("returns safe settings and does not switch demo DNS to a live server", async () => {
    expect((await PUT(request(input))).status).toBe(200);
    const result = await (await GET()).json(); expect(result.hasApiKey).toBe(true); expect(JSON.stringify(result)).not.toContain("test-only-secret"); expect(result.encryptedKey).toBeUndefined();
    expect((await connectionEnvironment()).PDNS_MOCK).toBe("true"); expect((await readConnection())?.encryptedKey).not.toBe(input.apiKey);
    expect((await PUT(request({ ...input, apiKey: "", serverId: "another" }))).status).toBe(400);
  });
  it("blocks non-admins and tests connections without saving or following redirects", async () => {
    vi.mocked(requireActor).mockResolvedValue({ id: "user", email: "user@example.com", globalRole: "USER", zoneRoles: {} });
    expect((await GET()).status).toBe(403); expect((await PUT(request(input))).status).toBe(403);
    vi.mocked(requireActor).mockResolvedValue({ id: "admin", email: "admin@example.com", globalRole: "ADMIN", zoneRoles: {} });
    const fetchMock = vi.fn(async () => Response.json([])); vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(input, "POST"))).status).toBe(200); expect(await readConnection()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ "X-API-Key": input.apiKey }) }));
  });
  it("sanitizes connection errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("error containing test-only-secret"); }));
    await expect(new PowerDNSClient({ NODE_ENV: "test", PDNS_API_URL: apiUrl, PDNS_API_KEY: input.apiKey }).listZones()).rejects.toMatchObject({ message: "Unable to connect to DNS server" });
  });
  it("does not report a malformed API response as a successful connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "not a zone list" })));
    expect((await POST(request(input, "POST"))).status).toBe(502);
  });
});
