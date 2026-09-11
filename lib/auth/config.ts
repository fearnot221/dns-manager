import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { demoUsers } from "@/lib/users/demo";
import { isOwnerEmail, resolvedGlobalRole } from "@/lib/auth/owner";
import { ncuPortalProvider, portalConfigured, portalIdentity } from "./ncu-portal";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(256) });

const credentialsProvider = Credentials({
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(raw) {
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
    return { id: user.id, email: user.email, name: user.name, image: user.image, globalRole: resolvedGlobalRole(user.email, user.globalRole) };
  },
});

const config: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  providers: [
    credentialsProvider,
    ...(portalConfigured() ? [ncuPortalProvider()] : []),
    ...(googleConfigured ? [Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: false,
    })] : []),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.globalRole = user.globalRole ?? "USER";
        if (!user.globalRole && process.env.DATABASE_URL) {
          token.globalRole = (await db.user.findUnique({ where: { id: user.id }, select: { globalRole: true } }))?.globalRole ?? "USER";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId);
        session.user.globalRole = token.globalRole ?? "USER";
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return Boolean(user.email);
      if (account?.provider === "ncu-portal") {
        try {
          const identity = portalIdentity(profile);
          if (identity.id !== account.providerAccountId) return false;
          const linked = await db.account.findUnique({ where: { provider_providerAccountId: { provider: "ncu-portal", providerAccountId: identity.id } }, include: { user: true } });
          if (linked) return !linked.user.disabled && (identity.owner ? isOwnerEmail(linked.user.email) && linked.user.globalRole === "SUPER_ADMIN" : !isOwnerEmail(linked.user.email));
          const existing = await db.user.findUnique({ where: { email: identity.email } });
          if (existing?.disabled) return false;
          if (!identity.owner) return !existing; // Never silently merge existing accounts by email.
          if (!existing || existing.globalRole !== "SUPER_ADMIN") return false; // Trusted seed required first.
          await db.account.create({ data: { userId: existing.id, type: "oauth", provider: "ncu-portal", providerAccountId: identity.id } });
          return true;
        } catch { return false; }
      }
      if (account?.provider !== "google" || !user.email || profile?.email_verified !== true) return false;
      const existing = await db.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { disabled: true } });
      return !existing?.disabled;
    },
  },
  events: {
    async signIn({ user }) {
      if (!process.env.DATABASE_URL || !user.id || user.id.startsWith("dev-")) return;
      await db.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          ...(user.email && isOwnerEmail(user.email) ? { globalRole: "SUPER_ADMIN" } : {}),
        },
      }).catch(() => undefined);
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
