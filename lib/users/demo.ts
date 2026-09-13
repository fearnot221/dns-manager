import "server-only";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_EMAIL } from "@/lib/auth/owner";
import { localDocument } from "@/lib/db/local-store";
import type { GlobalRole } from "@/lib/dns/types";

export type DemoUser = { id: string; email: string; name: string; studentId?: string | null; note?: string; portalIdentifier?: string | null; globalRole: GlobalRole; disabled: boolean; passwordHash: string | null; createdAt: string };
async function initialUsers(): Promise<DemoUser[]> {
  const definitions = [
    { id: "dev-owner", email: OWNER_EMAIL, name: "Fearnot", globalRole: "SUPER_ADMIN" as const, password: process.env.DEV_OWNER_PASSWORD || "DemoOwner!2026" },
    { id: "dev-admin", email: process.env.DEV_ADMIN_EMAIL || "admin@aegis.local", name: "Aegis Administrator", globalRole: "ADMIN" as const, password: process.env.DEV_ADMIN_PASSWORD || "AegisAdmin!2026" },
    { id: "dev-user", email: process.env.DEV_USER_EMAIL || "user@aegis.local", name: "Aegis User", globalRole: "USER" as const, password: process.env.DEV_USER_PASSWORD || "AegisUser!2026" },
    { id: "dev-alice", email: "alice@example.com", name: "Alice Lin", globalRole: "USER" as const, password: "" },
    { id: "dev-bob", email: "bob@example.com", name: "Bob Chen", globalRole: "USER" as const, password: "" },
  ];
  return Promise.all(definitions.map(async ({ password, ...user }) => ({ ...user, email: user.email.toLowerCase(), disabled: false, createdAt: new Date().toISOString(), passwordHash: password ? await hashPassword(password) : null })));
}
export function demoUsers<R>(operation: (users: DemoUser[]) => R | Promise<R>, write = false) { return localDocument("users", initialUsers, operation, write); }
