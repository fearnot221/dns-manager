/** Local demo does not use Portal. Password login can be disabled after testing. */
export function demoLoginEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && !env.DATABASE_URL;
}

export function loginProviderAllowed(provider: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (provider === "credentials") return passwordLoginEnabled(env);
  return !demoLoginEnabled(env) && provider === "ncu-portal";
}

export function passwordLoginEnabled(env: NodeJS.ProcessEnv = process.env) {
  return demoLoginEnabled(env);
}
