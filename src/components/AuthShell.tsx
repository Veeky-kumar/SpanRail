import Link from "next/link";
import { Logo } from "@/components/Logo";
import { IntakeFigure } from "@/components/auth/intake/figure";
import { Analytics } from "@/components/Analytics";
import { SourceCapture } from "@/components/SourceCapture";

/**
 * Split screen for sign in / sign up. The left panel is always dark (a data-theme scope), so the
 * figure reads the same in either theme; it is hidden on narrow screens, where the form carries its
 * own wordmark. The figure is the intake desk: a replayed, illustrative walk through what happens to
 * the events of one call after they reach Spanrail.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <Analytics />
      <SourceCapture />
      <section data-theme="dark" className="hidden flex-col justify-between bg-canvas p-12 text-ink lg:flex">
        <Link href="/" aria-label="Spanrail home" className="w-fit">
          <Logo />
        </Link>
        <div className="max-w-2xl">
          <h2 className="display">See where every LLM call spends its time.</h2>
          <p className="mt-4 max-w-md text-base text-muted">
            Traces, evaluations and prompts in one self-hosted place, with DNS, connect, TLS and first-byte timing for
            every call that passes through the gateway.
          </p>
          <div className="mt-8">
            <IntakeFigure />
          </div>
        </div>
        <p className="text-xs text-muted">Runs on your own infrastructure. Your data stays with you.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" aria-label="Spanrail home" className="mb-10 block w-fit lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
