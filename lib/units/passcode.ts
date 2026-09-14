import { createHash, randomBytes } from "node:crypto";
// High-entropy random invitation, never a user-chosen password. Only the digest is stored.
export function newPasscode() { return randomBytes(24).toString("base64url"); }
export function passcodeHash(value: string) { return createHash("sha256").update(value.trim()).digest("hex"); }
