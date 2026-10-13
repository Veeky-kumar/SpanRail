"use server";

import { AuthError } from "next-auth";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/password";
import { signIn } from "@/server/auth";
import type { AuthFormState } from "../login/actions";

export async function signupAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
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

  await prisma.user.create({ data: { email, name, passwordHash: hashPassword(password) } });

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
