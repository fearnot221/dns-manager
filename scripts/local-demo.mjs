import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const require = createRequire(import.meta.url);
const secret = process.env.AUTH_SECRET || randomBytes(32).toString("base64url");

// This command always uses local in-memory services, even if database settings exist.
const demoEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: "",
  PDNS_MOCK: "true",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NCU_PORTAL_CLIENT_ID: "",
  NCU_PORTAL_CLIENT_SECRET: "",
  AUTH_SECRET: secret,
  NEXTAUTH_SECRET: secret,
  AUTH_URL: "http://localhost:3000",
  NEXTAUTH_URL: "http://localhost:3000",
  AUTH_TRUST_HOST: "true",
  DEV_ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL || "admin@aegis.local",
  DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD || "AegisAdmin!2026",
  DEV_USER_EMAIL: process.env.DEV_USER_EMAIL || "user@aegis.local",
  DEV_USER_PASSWORD: process.env.DEV_USER_PASSWORD || "AegisUser!2026",
};

console.info("Aegis local demo · http://localhost:3000 · in-memory DNS and requests");
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
  cwd: root,
  env: demoEnv,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.on("exit", (code) => { process.exitCode = code ?? 0; });
