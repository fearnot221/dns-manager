import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { after } from "next/server";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { demoUsers } from "@/lib/users/demo";
import { resolvedGlobalRole } from "@/lib/auth/owner";
import { ncuPortalProvider, portalConfigured, portalIdentity } from "./ncu-portal";
import { passwordLoginEnabled, loginProviderAllowed } from "./policy";
import { logAuditEvent } from "@/lib/audit/service";
import { createIdleSession, readIdleSession, revokeIdleSession } from "./idle-session";

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(256) });

const credentialsProvider = Credentials({
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(raw) {
    if (!passwordLoginEnabled()) return null;
    const parsed = credentialsSchema.safeParse(raw);
    if (!parsed.success) return null;
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
      const account = await demoUsers((users) => users.find((item) => item.email === email));
      if (account && !account.disabled && account.passwordHash && await verifyPassword(password, account.passwordHash)) {
        return { id: account.id, email: account.email, name: account.name, globalRole: resolvedGlobalRole(account.email, account.globalRole) };
      }
    }

    if (!process.env.DATABASE_URL) return null;
    const user = await db.user.findUnique({ where: { email } });
    if (!user?.passwordHash || user.disabled || !await verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, email: user.email, name: user.name, globalRole: resolvedGlobalRole(user.email, user.globalRole) };
  },
});

const config: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  providers: [
    ...(passwordLoginEnabled() ? [credentialsProvider] : []),
    ...(portalConfigured() ? [ncuPortalProvider()] : []),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account) token.loginProvider = account.provider;
      if (account?.provider === "ncu-portal") token.portalEmail = portalIdentity(profile).email;
      // Roles come from the database, never Portal claims or an email domain.
      if (!loginProviderAllowed(token.loginProvider)) return null;
      if (user) {
        token.userId = user.id;
        token.globalRole = user.globalRole ?? "USER";
        if (!user.globalRole && process.env.DATABASE_URL) {
          token.globalRole = (await db.user.findUnique({ where: { id: user.id }, select: { globalRole: true } }))?.globalRole ?? "USER";
        }
      }
      if (user?.id && account) {
        token.idleSessionId = crypto.randomUUID();
        token.idleExpiresAt = await createIdleSession(token.idleSessionId, user.id);
      } else {
        const expires = await readIdleSession(token.idleSessionId);
        if (!expires) return null;
        token.idleExpiresAt = expires;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId);
        session.user.globalRole = token.globalRole ?? "USER";
        session.loginProvider = token.loginProvider;
        session.idleSessionId = token.idleSessionId;
        session.idleExpiresAt = token.idleExpiresAt;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (!loginProviderAllowed(account?.provider)) return false;
      if (account?.provider === "credentials") return Boolean(user.email);
      if (account?.provider === "ncu-portal") {
        try {
          const identity = portalIdentity(profile);
          if (identity.id !== account.providerAccountId) return false;
          const linked = await db.account.findUnique({ where: { provider_providerAccountId: { provider: "ncu-portal", providerAccountId: identity.id } }, include: { user: true } });
          if (linked) {
            if (linked.user.disabled) return false;
            await db.user.update({ where: { id: linked.user.id }, data: { studentId: identity.studentId, portalEmail: identity.portalEmail, name: identity.name, ...(identity.owner ? { globalRole: "SUPER_ADMIN" } : {}) } });
            return true;
          }
          const existing = await db.user.findUnique({ where: { email: identity.email } });
          if (existing?.disabled) return false;
          if (!identity.owner) return !existing; // Never silently merge existing accounts by email.
          if (!existing || existing.globalRole !== "SUPER_ADMIN") return false; // Trusted seed required first.
          await db.account.create({ data: { userId: existing.id, type: "oauth", provider: "ncu-portal", providerAccountId: identity.id } });
          await db.user.update({ where: { id: existing.id }, data: { portalEmail: identity.portalEmail, studentId: identity.studentId, name: identity.name } });
          return true;
        } catch { return false; }
      }
      return false;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id || !user.email) return;
      const id = user.id;
      const email = user.email;
      const lastLoginAt = new Date();
      // Informational bookkeeping must not delay the OAuth redirect.
      // Identity checks and account linking above remain synchronous.
      after(async () => {
        await logAuditEvent({ actor: { id, email, globalRole: user.globalRole ?? "USER", zoneRoles: {} }, zone: "", action: "SIGN_IN", after: { provider: account?.provider ?? "credentials" }, success: true }).catch(() => console.error("[audit] SIGN_IN persistence failed"));
        if (process.env.DATABASE_URL && !id.startsWith("dev-")) await db.user.update({ where: { id }, data: { lastLoginAt } })
          .catch(() => console.warn("[auth] lastLoginAt update failed"));
      });
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.idleSessionId) await revokeIdleSession(token.idleSessionId);
      if (!token?.userId || !token.email) return;
      const actor = { id: token.userId, email: token.email, globalRole: token.globalRole ?? "USER" as const, zoneRoles: {} };
      after(async () => { await logAuditEvent({ actor, zone: "", action: "SIGN_OUT", success: true }).catch(() => console.error("[audit] SIGN_OUT persistence failed")); });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
