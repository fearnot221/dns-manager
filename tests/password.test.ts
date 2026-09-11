import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("accepts the correct password and rejects a different one", async () => {
    const hash = await hashPassword("A-secure-password!2026");

    await expect(verifyPassword("A-secure-password!2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect-password", hash)).resolves.toBe(false);
  });

  it("uses a unique salt for every password", async () => {
    const first = await hashPassword("A-secure-password!2026");
    const second = await hashPassword("A-secure-password!2026");

    expect(first).not.toBe(second);
  });

  it("rejects short passwords and malformed hashes", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow("12 characters");
    await expect(verifyPassword("A-secure-password!2026", "invalid")).resolves.toBe(false);
  });
});
