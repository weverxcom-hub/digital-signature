import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

/**
 * In-memory login throttle.
 *
 * Per-process Map keyed by the normalized email. Each entry tracks recent
 * failed-attempt timestamps; once the user crosses LOCKOUT_THRESHOLD fails
 * inside LOCKOUT_WINDOW_MS, authorize() short-circuits to null until the
 * window slides past. We also impose a small artificial delay on every
 * failed attempt to slow scripted brute-force.
 *
 * Limitations:
 * - Single-instance memory only. On Vercel each lambda has its own Map; an
 *   attacker rotating across cold lambdas defeats the per-IP guarantee.
 *   For multi-instance deployments swap in Redis / @upstash/ratelimit.
 * - We don't distinguish failures caused by network glitches vs wrong
 *   credentials, but the threshold is generous enough that legitimate
 *   typos won't trigger a lockout in practice.
 */
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FAILED_LOGIN_DELAY_MS = 1000;

const failedAttempts = new Map<string, number[]>();

function recordFailure(key: string) {
  const now = Date.now();
  const arr = (failedAttempts.get(key) ?? []).filter(
    (t) => now - t < LOCKOUT_WINDOW_MS
  );
  arr.push(now);
  failedAttempts.set(key, arr);
}

function isLockedOut(key: string): boolean {
  const now = Date.now();
  const arr = (failedAttempts.get(key) ?? []).filter(
    (t) => now - t < LOCKOUT_WINDOW_MS
  );
  if (arr.length !== (failedAttempts.get(key)?.length ?? 0)) {
    failedAttempts.set(key, arr);
  }
  return arr.length >= LOCKOUT_THRESHOLD;
}

function clearFailures(key: string) {
  failedAttempts.delete(key);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const email = credentials.email.toLowerCase().trim();

        if (isLockedOut(email)) {
          // Add a slowdown so the client can't probe the lockout window
          // with millisecond precision.
          await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
          await logAudit({
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: email,
            metadata: { reason: "rate_limited" },
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });
        const ok =
          !!user &&
          user.active &&
          (await bcrypt.compare(credentials.password, user.password));

        if (!ok) {
          recordFailure(email);
          await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
          // Log a failed-login audit row keyed by the attempted email so
          // admins can spot scripted attacks. We never include the
          // attempted password in metadata.
          await logAudit({
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user?.id ?? email,
            userId: user?.id ?? null,
            metadata: {
              email,
              reason: !user
                ? "unknown_email"
                : !user.active
                  ? "inactive"
                  : "bad_password",
            },
          });
          return null;
        }

        clearFailures(email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};

export function isAdmin(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}
