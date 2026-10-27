"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";
import { signIn } from "@/server/auth";

export interface AuthFormState {
  error?: string;
}

// Guessing passwords is the attack on a public login, so count every attempt: 10 a minute per address, and 8 per
// 10 minutes against any one email so a botnet cannot spread guesses across addresses.
const byAddress = createRateLimiter(10, 60 * 1000);
const byEmail = createRateLimiter(8, 10 * 60 * 1000);

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  const requestHeaders = await headers();
  const limited = [byAddress.hit(clientKey((n) => requestHeaders.get(n))), byEmail.hit(email)].find((r) => !r.allowed);
  if (limited) return { error: `Too many sign-in attempts. Try again in ${Math.ceil(limited.retryAfterSec / 60)} minute(s).` };

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw err; // NEXT_REDIRECT must propagate on success
  }
}
