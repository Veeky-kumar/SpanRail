import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logoutAction } from "@/app/actions";

/** Top bar for screens that are not inside a project (the projects home). */
export function HomeBar({ email }: { email: string }) {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Spanrail, all projects">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="hidden max-w-[16rem] truncate text-xs text-muted sm:inline" title={email}>
            {email}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="pressable rounded-data px-1.5 py-1 text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
