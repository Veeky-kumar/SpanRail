"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "./actions";
import type { AuthFormState } from "../login/actions";

const initialState: AuthFormState = {};

export function SignupForm({ closedMessage }: { closedMessage?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  if (closedMessage) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign-ups are closed</h1>
        <p className="mt-1 text-sm text-muted">{closedMessage}</p>
        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Create your account</h1>
      <p className="mt-1 text-sm text-muted">You can create projects and API keys right after.</p>

      <label htmlFor="name" className="mt-6 block text-sm font-medium">
        Name <span className="font-normal text-muted">(optional)</span>
      </label>
      <input id="name" name="name" autoComplete="name" className="input mt-1.5" />

      <label htmlFor="email" className="mt-4 block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoFocus
        autoComplete="username"
        aria-describedby={state.error ? "signup-error" : undefined}
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
        minLength={8}
        autoComplete="new-password"
        aria-describedby="password-hint"
        className="input mt-1.5"
      />
      <p id="password-hint" className="mt-1 text-xs text-muted">
        At least 8 characters.
      </p>

      {state.error && (
        <p id="signup-error" role="alert" className="reveal mt-3 text-sm text-fault">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary pressable mt-6 w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="mt-4 text-xs text-muted">
        We note which link brought you here and your country; we never store your IP address.
      </p>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
          Sign in
        </Link>
      </p>
    </form>
  );
}
