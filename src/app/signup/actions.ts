"use server";

import { cookies, headers } from "next/headers";
import { AuthError } from "next-auth";
import { countryFromHeaders, parseSourceCookie, SOURCE_COOKIE } from "@/lib/attribution";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { SIGNUPS_CLOSED_MESSAGE, signupsOpen } from "@/lib/signups";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/password";
import { signIn } from "@/server/auth";
import type { AuthFormState } from "../login/actions";

// 5 sign-ups an hour per address: enough for a shared office, too few for a bot filling the table.
const signupLimiter = createRateLimiter(5, 60 * 60 * 1000);

export async function signupAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const requestHeaders = await headers();
  if (!signupsOpen()) return { error: SIGNUPS_CLOSED_MESSAGE };

  const limited = signupLimiter.hit(clientKey((n) => requestHeaders.get(n)));
  if (!limited.allowed) {
    return { error: `Too many sign-ups from this address. Try again in ${Math.ceil(limited.retryAfterSec / 60)} minutes.` };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || undefined;

  if (!email || !password || password.length < 8) {
    return { error: "Email and an 8+ character password are required" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists" };
  }

  // Where the visitor came from: the first-party cookie set on their first page, and a coarse country from the edge
  // headers. Best effort: an absent or tampered cookie just records nothing. The IP address is only an in-memory
  // rate-limit key above and is never stored.
  const source = parseSourceCookie((await cookies()).get(SOURCE_COOKIE)?.value);
  const country = countryFromHeaders((name) => requestHeaders.get(name));

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      signupReferrer: source.referrer,
      signupUtmSource: source.utmSource,
      signupUtmMedium: source.utmMedium,
      signupUtmCampaign: source.utmCampaign,
      signupCountry: country,
    },
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created — please sign in" };
    }
    throw err; // NEXT_REDIRECT must propagate on success
  }
}
