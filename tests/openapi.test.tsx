import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { openApiDocument } from "@/lib/openapi/document";

vi.mock("@/lib/auth/session", () => ({ requireActor: vi.fn(), AuthError: class extends Error {} }));
import { AuthError, requireActor } from "@/lib/auth/session";
import { GET } from "@/app/api/openapi/route";
import ApiDocsPage from "@/app/(workspace)/guide/api/page";

beforeEach(() => { vi.mocked(requireActor).mockReset(); });

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routeFiles(join(directory, entry.name)) : entry.name === "route.ts" ? [join(directory, entry.name)] : []);
}

it("documents every exported HTTP method, including retired endpoints and Auth.js", () => {
  const documented = new Set(Object.entries(openApiDocument.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => `${method.toUpperCase()} ${operation["x-source-route"] ?? `app${path.replace(/\{([^}]+)\}/g, "[$1]")}/route.ts`}`)));
  const actual = routeFiles("app/api").concat("app/healthz/route.ts").flatMap(file => [...readFileSync(file, "utf8").matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(([, method]) => `${method} ${file}`));
  expect([...documented].sort()).toEqual(actual.sort());
});

it("keeps unique operation IDs, required path parameters, and resolvable references", () => {
  const ids: string[] = [];
  for (const [path, methods] of Object.entries(openApiDocument.paths)) for (const operation of Object.values(methods)) {
    ids.push(operation.operationId);
    const params = operation.parameters.filter(parameter => parameter.in === "path");
    expect(params.map(p => p.name).sort()).toEqual([...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => name).sort());
    expect(params.every(p => p.required)).toBe(true);
    expect(operation.summary).toBeTruthy();
    expect(operation["x-access"]).toBeTruthy();
    expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
  }
  expect(new Set(ids).size).toBe(ids.length);
  for (const [, pointer] of JSON.stringify(openApiDocument).matchAll(/"\$ref":"#\/([^" ]+)"/g)) {
    let value: unknown = openApiDocument;
    for (const segment of pointer.split("/")) value = (value as Record<string, unknown>)[segment];
    expect(value, pointer).toBeDefined();
  }
});

it("exports the same specification served by the application", () => {
  expect(JSON.parse(readFileSync("docs/openapi.json", "utf8"))).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
  expect(openApiDocument.openapi).toBe("3.1.1");
  expect(openApiDocument.paths["/api/zones"].post.responses).toHaveProperty("405");
  expect(openApiDocument.paths["/api/contact"].post).toMatchObject({ deprecated: true, responses: { "410": expect.anything() } });
  expect(openApiDocument.paths["/api/admin/dns-export"].post.responses["200"]).toHaveProperty("content.text/csv");
  expect(openApiDocument.paths["/api/zones/{zone}"].delete.responses["204"]).not.toHaveProperty("content");
});

it("serves specification JSON only after authentication with no caching", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "reader" } as never);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
});

it("rejects unauthenticated specification downloads", async () => {
  vi.mocked(requireActor).mockRejectedValue(new AuthError());
  expect((await GET()).status).toBe(401);
});

it("rejects unauthenticated documentation pages", async () => {
  vi.mocked(requireActor).mockRejectedValue(new AuthError());
  await expect(ApiDocsPage()).rejects.toBeInstanceOf(AuthError);
});

it("renders the operation catalog and schema definitions without executing requests", async () => {
  vi.mocked(requireActor).mockResolvedValue({ id: "reader" } as never);
  const html = renderToStaticMarkup(await ApiDocsPage());
  expect(html).toContain('href="/api/openapi"');
  expect(html).toContain("/api/units/{id}/changes");
  expect(html).toContain("資料結構");
  expect(html).toContain("DnsApplication");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<form");
});
