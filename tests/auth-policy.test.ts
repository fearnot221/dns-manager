import { expect, it } from "vitest";
import { demoLoginEnabled, loginProviderAllowed } from "@/lib/auth/policy";
it("can disable password login in production regardless of mock or database settings", () => {
  for (const DATABASE_URL of ["", "postgresql://db/test"]) {
    const env = { NODE_ENV: "production", DATABASE_URL, PDNS_MOCK: "true", AUTH_PASSWORD_LOGIN_ENABLED: "false" } as NodeJS.ProcessEnv;
    expect(demoLoginEnabled(env)).toBe(false);
    expect(loginProviderAllowed("ncu-portal", env)).toBe(true);
    for (const provider of [undefined, "credentials", "google"]) expect(loginProviderAllowed(provider, env)).toBe(false);
  }
});
it("retains credentials only in local demo", () => {
  const env = { NODE_ENV: "development", DATABASE_URL: "" } as NodeJS.ProcessEnv;
  expect(loginProviderAllowed("credentials", env)).toBe(true);
  expect(loginProviderAllowed("ncu-portal", env)).toBe(false);
  expect(loginProviderAllowed("credentials", { ...env, DATABASE_URL: "postgresql://db/test" })).toBe(false);
});
