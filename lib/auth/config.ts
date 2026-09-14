import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { after } from "next/server";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { demoUsers } from "@/lib/users/demo";
import { accountOwnerIdentifier, OWNER_IDENTIFIER, OWNER_EMAIL, resolvedGlobalRole } from "@/lib/auth/owner";
import { logtoProvider, logtoConfigured, logtoIdentity } from "./logto";
import { passwordLoginEnabled, loginProviderAllowed } from "./policy";
import { logAuditEvent } from "@/lib/audit/service";
import { createIdleSession, readIdleSession, revokeIdleSession } from "./idle-session";
import { denyLogtoLogin } from "./timing";

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
    if (!user?.passwordHash || user.disabled || user.removedAt || !await verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, email: user.email, name: user.name, globalRole: resolvedGlobalRole(user.email, user.globalRole) };
  },
});

const config: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  providers: [
    ...(passwordLoginEnabled() ? [credentialsProvider] : []),
    ...(logtoConfigured() ? [logtoProvider()] : []),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account) token.loginProvider = account.provider;
      if (account?.provider === "logto") { token.portalEmail = logtoIdentity(profile).portalEmail || undefined; token.logtoIdToken = account.id_token; }
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
      if (account?.provider === "logto") {
        let failureStage: "invalid_profile" | "account_lookup_failed" | "profile_update_failed" = "invalid_profile";
        try {
          const identity = logtoIdentity(profile);
          if (identity.id !== account.providerAccountId) return denyLogtoLogin("subject_mismatch");
          const ownerSub = process.env.LOGTO_OWNER_SUB;
          if (!ownerSub) return denyLogtoLogin("owner_not_configured");
          failureStage = "account_lookup_failed";
          const linked = await db.account.findUnique({ where: { provider_providerAccountId: { provider: "logto", providerAccountId: identity.id } }, include: { user: { include: { accounts: true } } } });
          if (linked) {
            if (linked.user.disabled || linked.user.removedAt) return denyLogtoLogin("account_inactive");
            const ownerTarget = accountOwnerIdentifier(linked.user.accounts.filter((a) => a.provider !== "logto")) === OWNER_IDENTIFIER || (linked.user.globalRole === "SUPER_ADMIN" && linked.user.email === OWNER_EMAIL);
            if (ownerTarget && identity.id !== ownerSub) return denyLogtoLogin("owner_binding_mismatch");
            const displayName = identity.hasName ? identity.name : linked.user.name || identity.name;
            failureStage = "profile_update_failed";
            await db.user.update({ where: { id: linked.user.id }, data: { portalEmail: identity.portalEmail, name: displayName } });
            user.name = displayName;
            return true;
          }
          // A new subject gets an independent USER account, even if its verified email
          // matches an existing user. Never inherit roles or data through email claims.
          // Keep synthetic-email collisions fail-closed (e.g. an unlinked old identity).
          const existing = await db.user.findFirst({ where: { email: identity.email } });
          return existing ? denyLogtoLogin("account_link_required") : true;
        } catch { return denyLogtoLogin(failureStage); }
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
        await logAuditEvent({ actor: { id, email, name: user.name, globalRole: user.globalRole ?? "USER", zoneRoles: {} }, zone: "", action: "SIGN_IN", after: { provider: account?.provider ?? "credentials" }, success: true }).catch(() => console.error("[audit] SIGN_IN persistence failed"));
        if (process.env.DATABASE_URL && !id.startsWith("dev-")) await db.user.update({ where: { id }, data: { lastLoginAt } })
          .catch(() => console.warn("[auth] lastLoginAt update failed"));
      });
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.idleSessionId) await revokeIdleSession(token.idleSessionId);
      if (!token?.userId || !token.email) return;
      const actor = { id: token.userId, email: token.email, name: token.name, globalRole: token.globalRole ?? "USER" as const, zoneRoles: {} };
      after(async () => { await logAuditEvent({ actor, zone: "", action: "SIGN_OUT", success: true }).catch(() => console.error("[audit] SIGN_OUT persistence failed")); });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
