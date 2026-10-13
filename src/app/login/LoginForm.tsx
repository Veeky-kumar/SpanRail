"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold tracking-tight">Sign in to Tracewell</h1>

      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label className="mt-4 block text-xs font-medium text-muted">Email</label>
      <input
        name="email"
        type="email"
        required
        autoFocus
        className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent"
      />

      <label className="mt-3 block text-xs font-medium text-muted">Password</label>
      <input
        name="password"
        type="password"
        required
        className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent"
      />

      {state.error && <p className="reveal mt-2 text-xs text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="pressable mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-4 text-center text-xs text-muted">
        No account? <Link href="/signup" className="text-accent hover:underline">Sign up</Link>
      </p>
    </form>
  );
}
