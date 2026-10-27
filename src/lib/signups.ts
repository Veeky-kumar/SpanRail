// Lets an operator close registration on a public deployment: set SIGNUPS_DISABLED=true, then existing users still
// sign in and everyone else sees a notice on the sign-up page.
export function signupsOpen(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.SIGNUPS_DISABLED?.trim().toLowerCase();
  return !(v === "true" || v === "1" || v === "yes");
}

export const SIGNUPS_CLOSED_MESSAGE = "Sign-ups are closed on this instance. Ask the person who runs it for an invitation.";
