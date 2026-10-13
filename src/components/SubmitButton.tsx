"use client";

import { useFormStatus } from "react-dom";

/**
 * Plain `<form action={...}>` buttons had no pending state at all — clicking "Create
 * dataset" or "Add item" gave zero feedback until the page revalidated. Per the
 * apple-design skill's "Response" principle: feedback must be continuous, not just at
 * completion. useFormStatus reads the nearest parent <form>'s pending state without
 * needing to rewrite these as useActionState.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
