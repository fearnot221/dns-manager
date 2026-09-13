import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

it("runs the CLI in the project's CommonJS mode without top-level-await errors", () => {
  // Deliberately unreachable loopback database: verifies actual tsx execution,
  // without creating accounts or touching a real database.
  const result = spawnSync(process.execPath, [require.resolve("tsx/cli"), "scripts/create-test-user.ts"], {
    cwd: process.cwd(), timeout: 10000, encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test?connect_timeout=1" },
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unable to create test account. Check database connectivity and permissions.");
  expect(result.stderr).not.toMatch(/TransformError|Top-level await|ERR_MODULE_NOT_FOUND/);
  expect(result.stdout).not.toContain("Password:");
});
