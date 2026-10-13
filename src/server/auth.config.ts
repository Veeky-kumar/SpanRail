import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the NextAuth config — no Prisma, no scrypt. Used directly by
// middleware (which runs on the Edge runtime) and spread into the full config in
// auth.ts (which adds the Credentials provider and runs on the Node runtime). Splitting
// it this way keeps Node-only code out of the Edge middleware bundle, which is the
// documented way to use NextAuth v5's Credentials provider together with middleware.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Self-hosted behind an operator-controlled reverse proxy/firewall, not a
  // multi-tenant host serving arbitrary hostnames — so there's no fixed public URL to
  // pin in advance, and NextAuth's default Host-header allowlist (meant to stop
  // cache-poisoning-style attacks on a multi-hostname SaaS) has no real target here.
  // Confirmed via a real containerized deployment test: without this, every request
  // fails with `UntrustedHost` the moment the container's hostname differs from
  // "localhost". If you front this with a reverse proxy on a fixed domain, you can
  // tighten this back to an explicit AUTH_URL instead.
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.userId as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
