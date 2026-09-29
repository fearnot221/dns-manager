import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
// Valid scrypt encoding for equal-cost nonexistent/disabled-account verification.
// Its value is deliberately public; it is never associated with an account.
export const dummyPasswordHash = `scrypt$${"00".repeat(16)}$${"00".repeat(keyLength)}`;

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [scheme, saltHex, hashHex] = encoded.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== keyLength) return false;
    const derived = await scrypt(password, Buffer.from(saltHex, "hex"), keyLength) as Buffer;
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
