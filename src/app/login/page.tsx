import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <AuthShell>
      <LoginForm callbackUrl={callbackUrl ?? "/"} />
    </AuthShell>
  );
}
