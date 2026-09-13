/** Password authentication is restricted to the database-free local demo. */
export function demoLoginEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && !env.DATABASE_URL;
}

export function loginProviderAllowed(provider: unknown, env: NodeJS.ProcessEnv = process.env) {
  return demoLoginEnabled(env) ? provider === "credentials" : provider === "ncu-portal";
}
