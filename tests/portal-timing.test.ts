import { customFetch } from "@auth/core";
import { afterEach, expect, it, vi } from "vitest";
import { ncuPortalProvider } from "@/lib/auth/ncu-portal";
import { measurePortalCallback } from "@/lib/auth/timing";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("preserves the token response, combines timeout and logs no secrets", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetchMock = vi.fn(async () => Response.json({ access_token: "do-not-log" }));
  vi.stubGlobal("fetch", fetchMock);
  const request = ncuPortalProvider()[customFetch]!;
  const original = new AbortController();
  const response = await measurePortalCallback(async () => {
    const token = await request("https://portal.ncu.edu.tw/oauth2/token", { signal: original.signal, method: "POST", body: "secret-code" });
    expect(await token.json()).toEqual({ access_token: "do-not-log" });
    return new Response(null, { status: 302, headers: { Location: "/requests", "Set-Cookie": "session=preserved" } });
  });
  expect(response.headers.get("Server-Timing")).toMatch(/^portal_callback;dur=/);
  expect(response.headers.get("Set-Cookie")).toBe("session=preserved");
  const init = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
  expect(init[1]).toMatchObject({ cache: "no-store", redirect: "error" });
  expect(init[1].signal).not.toBe(original.signal);
  original.abort(); expect(init[1].signal?.aborted).toBe(true);
  const lines = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(lines.map((line) => line.stage)).toEqual(["token", "callback"]);
  expect(lines[0].requestId).toBe(lines[1].requestId);
  expect(JSON.stringify(lines)).not.toMatch(/do-not-log|secret-code|session=preserved/);
});
it("records failures without leaking upstream error details", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret-token"); }));
  await expect(ncuPortalProvider()[customFetch]!("https://portal.ncu.edu.tw/apis/oauth/v1/info")).rejects.toThrow();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('"completed":false'));
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
});
