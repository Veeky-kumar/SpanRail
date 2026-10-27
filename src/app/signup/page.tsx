import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
