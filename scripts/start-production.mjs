// Fail closed before accepting traffic; never print secret values.
export function validateProductionEnvironment(env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const origin = new URL(env.AUTH_URL || "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("AUTH_URL must be a public HTTPS origin");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || /replace|change.me/i.test(env.AUTH_SECRET)) throw new Error("AUTH_SECRET must be a persistent random secret of at least 32 characters");
  if (!/^[a-f0-9]{64}$/i.test(env.SETTINGS_ENCRYPTION_KEY || "")) throw new Error("SETTINGS_ENCRYPTION_KEY must be 64 hex characters");
  if (env.AUTH_PASSWORD_LOGIN_ENABLED === "false" && !env.AUTH_LOGTO_SECRET) throw new Error("Configure Logto before disabling password login");
  if (!['true', 'false'].includes(env.PDNS_MOCK || 'false')) throw new Error("PDNS_MOCK must be true or false");
}
if (process.argv[1]?.endsWith("/start-production.mjs")) {
  try { validateProductionEnvironment(process.env); await import("../server.js"); }
  catch (error) { console.error("Startup blocked:", error instanceof Error ? error.message : "Invalid configuration"); process.exitCode = 1; }
}
