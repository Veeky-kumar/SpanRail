import { connection } from "next/server";
import { AuthShell } from "@/components/AuthShell";
import { SIGNUPS_CLOSED_MESSAGE, signupsOpen } from "@/lib/signups";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  await connection(); // read SIGNUPS_DISABLED per request, not at build time
  return (
    <AuthShell>
      <SignupForm closedMessage={signupsOpen() ? undefined : SIGNUPS_CLOSED_MESSAGE} />
    </AuthShell>
  );
}
