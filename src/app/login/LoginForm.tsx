"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction}>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back. Use the email and password for your Tracewell account.</p>

      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label htmlFor="email" className="mt-6 block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoFocus
        autoComplete="username"
        aria-describedby={state.error ? "login-error" : undefined}
        className="input mt-1.5"
      />

      <label htmlFor="password" className="mt-4 block text-sm font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-describedby={state.error ? "login-error" : undefined}
        className="input mt-1.5"
      />

      {state.error && (
        <p id="login-error" role="alert" className="reveal mt-3 text-sm text-fault">
          {state.error}. Check both and try again.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary pressable mt-6 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-6 text-sm text-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
          Create one
        </Link>
      </p>
    </form>
  );
}
