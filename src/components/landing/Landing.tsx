import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ProductVisual } from "@/components/ProductVisual";
import { ThemeToggle } from "@/components/ThemeToggle";

const STEPS = [
  {
    title: "Point your client at the gateway",
    body: "Change the base URL of any OpenAI-compatible client. Your provider key stays in your client and is never stored.",
  },
  {
    title: "Calls appear as traces",
    body: "Each call is reported with its model, status and token usage when the provider sends it. Unknown stays unknown; nothing is estimated.",
  },
  {
    title: "Read the time budget",
    body: "The gateway measures DNS, connect, TLS and time to first byte, so you can tell a slow provider from a slow network.",
  },
];

const CAPABILITIES = [
  { name: "Tracing", body: "Nested spans and generations with errors, cost and usage, in a tree you can search and expand." },
  { name: "Evaluation", body: "Datasets, runs and deterministic scorers, with a comparison view to catch regressions." },
  { name: "Prompts", body: "Versioned prompts with labels, linked to the generations that used them." },
  { name: "Analytics", body: "Trace volume, error rate, cost and latency percentiles over the last 7, 14 or 30 days." },
];

const RUN_IT = `cp .env.production.example .env.production
docker compose -f docker-compose.yml -f docker-compose.prod.yml \\
  --env-file .env.production up -d --build`;

/** Public page for signed-out visitors at "/". Signed-in users get the projects home instead. */
export function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Tracewell home">
          <Logo />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary hidden sm:inline-flex">
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-20">
          <div>
            <h1 className="display-xl">See where every LLM call spends its time.</h1>
            <p className="mt-6 max-w-lg text-lg text-muted">
              Tracewell is a self-hosted place for traces, evaluations and prompts. Its Go gateway measures DNS,
              connect, TLS and first byte for every call that passes through it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary px-5 py-2.5">
                Create account
              </Link>
              <Link href="/login" className="btn-secondary px-5 py-2.5">
                Sign in
              </Link>
            </div>
          </div>
          <div className="ruler-grow">
            <ProductVisual />
          </div>
        </section>

        <section aria-labelledby="how" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how" className="text-2xl font-semibold tracking-[-0.02em]">
              From first request to first answer
            </h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-data border border-rule bg-rule md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="bg-surface p-6">
                  <span className="font-mono text-sm tabular-nums text-accent">{i + 1}</span>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="what" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="what" className="text-2xl font-semibold tracking-[-0.02em]">
            What is in it
          </h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.name} className="border-t border-rule pt-4">
                <dt className="text-base font-semibold">{c.name}</dt>
                <dd className="mt-1.5 max-w-md text-sm text-muted">{c.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="run" className="border-t border-rule bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 id="run" className="text-2xl font-semibold tracking-[-0.02em]">
                Run it yourself
              </h2>
              <p className="mt-3 max-w-md text-sm text-muted">
                Tracewell needs Docker. Postgres and Redis come with it, and your traces stay on your own
                infrastructure.
              </p>
              <p className="mt-3 max-w-md text-sm text-muted">
                It is early software: read the known limitations in the README before exposing it beyond a trusted
                network.
              </p>
            </div>
            <pre className="overflow-x-auto rounded-data border border-rule bg-canvas p-4 font-mono text-xs leading-relaxed">
              {RUN_IT}
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <Logo className="text-muted" />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
