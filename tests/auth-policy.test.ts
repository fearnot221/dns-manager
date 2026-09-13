import { expect, it } from "vitest";
import { demoLoginEnabled, loginProviderAllowed } from "@/lib/auth/policy";
it("allows only Portal in production, regardless of mock or database settings", () => {
  for (const DATABASE_URL of ["", "postgresql://db/test"]) {
    const env = { NODE_ENV: "production", DATABASE_URL, PDNS_MOCK: "true" } as NodeJS.ProcessEnv;
    expect(demoLoginEnabled(env)).toBe(false);
    expect(loginProviderAllowed("ncu-portal", env)).toBe(true);
    for (const provider of [undefined, "credentials", "google"]) expect(loginProviderAllowed(provider, env)).toBe(false);
  }
});
it("keeps credentials exclusively in database-free development", () => {
  const env = { NODE_ENV: "development", DATABASE_URL: "" } as NodeJS.ProcessEnv;
  expect(loginProviderAllowed("credentials", env)).toBe(true);
  expect(loginProviderAllowed("ncu-portal", env)).toBe(false);
  expect(loginProviderAllowed("credentials", { ...env, DATABASE_URL: "postgresql://db/test" })).toBe(false);
});
