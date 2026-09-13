import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: new Proxy({}, { get() { throw new Error("Must not access database settings"); } }) }));
import { connectionEnvironment, validateApiUrl } from "@/lib/powerdns/settings";
import { GET, POST, PUT } from "@/app/api/admin/powerdns/route";
import { PowerDNSClient } from "@/lib/powerdns/client";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("uses only operator environment, without database access", async () => {
  vi.stubEnv("PDNS_MOCK", "false");
  vi.stubEnv("PDNS_API_URL", "http://pdns.internal:8081/api/v1/");
  vi.stubEnv("PDNS_API_KEY", "env-only-secret");
  expect(await connectionEnvironment()).toMatchObject({ PDNS_API_URL: "http://pdns.internal:8081/api/v1", PDNS_API_KEY: "env-only-secret" });
  vi.stubEnv("PDNS_API_URL", "");
  expect((await connectionEnvironment()).PDNS_API_URL).toBe("");
});
it("retains mock mode for local demo", async () => {
  vi.stubEnv("PDNS_MOCK", "true");
  expect(await connectionEnvironment()).toBe(process.env);
});
it("rejects credentials, query strings, fragments and non-API URLs", () => {
  for (const url of ["file:///api/v1", "http://u:p@pdns/api/v1", "http://pdns/api/v1?key=x", "http://pdns/api/v1#x", "http://pdns/other"]) expect(() => validateApiUrl(url)).toThrow();
});
it("retired endpoints cannot read, save or test keys", async () => {
  vi.stubEnv("PDNS_API_KEY", "hidden-secret");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  for (const handler of [GET, PUT, POST]) {
    const response = handler();
    expect(response.status).toBe(410);
    expect(await response.text()).not.toContain("hidden-secret");
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
it("sanitizes network errors and rejects redirects", async () => {
  const fetchMock = vi.fn(async () => { throw new Error("secret-key"); });
  vi.stubGlobal("fetch", fetchMock);
  await expect(new PowerDNSClient({ NODE_ENV: "test", PDNS_API_URL: "http://pdns/api/v1", PDNS_API_KEY: "secret-key" }).listZones()).rejects.toMatchObject({ message: "Unable to connect to DNS server" });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
});
