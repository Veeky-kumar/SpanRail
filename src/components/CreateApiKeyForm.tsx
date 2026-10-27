"use client";

import { useActionState } from "react";
import { createApiKeyAction, type CreateApiKeyState } from "@/app/projects/[projectId]/settings/actions";

const initialState: CreateApiKeyState = {};

export function CreateApiKeyForm({ projectId }: { projectId: string }) {
  const action = createApiKeyAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="rounded-data border border-rule bg-surface p-4">
      <h3 className="text-sm font-medium">Create API key</h3>
      <p className="mt-1 text-xs text-muted">Used by the SDK to send traces and manage prompts/datasets.</p>

      <form action={formAction} className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary pressable"
        >
          {pending ? "Generating…" : "Generate new key"}
        </button>
      </form>

      {state.secretKey && (
        <div className="reveal mt-4 rounded-data border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium text-amber-600">Save this now — the secret key cannot be shown again.</p>
          <div className="mt-2 space-y-1 font-mono">
            <div>
              <span className="text-muted">SPANRAIL_PUBLIC_KEY=</span>
              {state.publicKey}
            </div>
            <div>
              <span className="text-muted">SPANRAIL_SECRET_KEY=</span>
              {state.secretKey}
            </div>
          </div>
        </div>
      )}

      {state.error && <p className="reveal mt-2 text-xs text-fault">{state.error}</p>}
    </div>
  );
}
