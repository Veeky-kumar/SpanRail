import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LifeOfACall } from "@/components/landing/LifeOfACall";
import { OnThisPage, type PageSection } from "@/components/landing/OnThisPage";
import { TracePreview } from "@/components/landing/TracePreview";
import { TimeRailFigure } from "@/components/landing/timeRail/figure";

const SECTIONS: PageSection[] = [
  { id: "overview", label: "Overview" },
  { id: "life-of-a-call", label: "The life of a call" },
  { id: "one-line", label: "Change one line" },
  { id: "what-you-see", label: "What you see" },
  { id: "gateway", label: "The gateway" },
  { id: "inside", label: "What is in it" },
  { id: "faq", label: "Questions" },
  { id: "run", label: "Run it yourself" },
];

const GATEWAY_FACTS = [
  {
    name: "About half a millisecond",
    body: "That is what the gateway adds at the median, and 0.75 to 1.3 ms at the 95th percentile, against a 20 ms upstream. Measured on one Windows machine over loopback, three runs per case. A real network will differ, so measure your own.",
  },
  {
    name: "It never makes your call wait",
    body: "Reports go through a bounded queue and are sent in the background. If Spanrail is slow and the queue fills, events are dropped and counted. Your calls are not.",
  },
  {
    name: "Your key stays yours",
    body: "The gateway never forwards or reports your provider key. Request and response bodies are not captured unless you turn that on.",
  },
  {
    name: "It flushes on shutdown",
    body: "On SIGTERM it stops taking new calls, then sends what is queued before it exits.",
  },
];

const CAPABILITIES = [
  { name: "Tracing", body: "Nested spans and generations with errors, cost and usage, in a tree you can search and expand." },
  { name: "Evaluation", body: "Datasets, runs and deterministic scorers, with a comparison view to catch regressions." },
  { name: "Prompts", body: "Versioned prompts with labels, linked to the generations that used them." },
  { name: "Analytics", body: "Trace volume, error rate, cost and latency percentiles over the last 7, 14 or 30 days." },
];

const FAQ = [
  {
    q: "Do I have to change my code?",
    a: "Only the base URL of an OpenAI-compatible client. Your provider key stays in the client and passes straight through the gateway.",
  },
  {
    q: "What happens if Spanrail is down or slow?",
    a: "Your calls are not affected. The gateway reports in the background and retries failed batches with backoff. If its queue fills up it drops events and counts them.",
  },
  {
    q: "Does it work with streaming?",
    a: "Yes. Streamed replies pass through without being buffered. Token usage is recorded only when the provider sends it in the stream; OpenAI-style streams do when the client asks for it with stream_options.include_usage.",
  },
  {
    q: "Which providers does it understand?",
    a: "Any OpenAI-compatible API. Streamed token usage from Anthropic's own API and from OpenAI's Responses API is not parsed yet, so those calls are traced without usage.",
  },
  {
    q: "Where does my data live?",
    a: "In your own Postgres. Spanrail is self-hosted, and the gateway does not store request or response bodies unless you enable it.",
  },
  {
    q: "Is it ready for production?",
    a: "Not yet. It is early software, and the README lists its known limitations. Run it on a trusted network until you have read them.",
  },
];

const RUN_IT = `cp .env.production.example .env.production
docker compose -f docker-compose.yml -f docker-compose.prod.yml \\
  --env-file .env.production up -d --build`;

const BEFORE = `from openai import OpenAI

client = OpenAI(api_key="sk-your-provider-key")`;

const AFTER = `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-your-provider-key",
)`;

const ATTACH = `curl localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "X-Spanrail-Trace-Id: my-existing-trace" \\
  -d '{"model":"...","messages":[]}'`;

function Code({ children, label }: { children: string; label: string }) {
  return (
    <figure>
      <figcaption className="mb-1.5 text-xs text-muted">{label}</figcaption>
      <pre className="overflow-x-auto rounded-data border border-rule bg-canvas p-4 font-mono text-xs leading-relaxed">{children}</pre>
    </figure>
  );
}

function Heading({ id, children, lead }: { id: string; children: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <>
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">
        {children}
      </h2>
      {lead ? <p className="mt-3 max-w-2xl text-base text-muted">{lead}</p> : null}
    </>
  );
}

/** Public page for signed-out visitors at "/". Signed-in users get the projects home instead. */
export function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Spanrail home">
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

      <div className="mx-auto max-w-6xl px-4 sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:gap-12">
        <main>
          <section id="overview" aria-labelledby="overview-title" className="scroll-mt-20 pb-16 pt-10 lg:pt-16">
            <h1 id="overview-title" className="display-xl max-w-4xl">
              See where every LLM call spends its time.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted">
              Spanrail is a self-hosted place for traces, evaluations and prompts. Its Go gateway measures DNS,
              connect, TLS and first byte for every call that passes through it, and draws each one to scale.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary px-5 py-2.5">
                Create account
              </Link>
              <Link href="/login" className="btn-secondary px-5 py-2.5">
                Sign in
              </Link>
            </div>
            <div className="mt-12">
              <TimeRailFigure
                fig="Fig 1"
                title="One call, drawn to scale"
                hint="A sample call"
                fixedStep={6}
                slideIn
                tour
                caption="A sample call from request to report, drawn on the time rail: one block for each phase of the round trip. The carriage travels the call when the page loads, then replays it; click to replay. Sample data."
              />
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="life-of-a-call" aria-labelledby="life-title" className="scroll-mt-20 py-16">
            <Heading
              id="life-title"
              lead="One call, step by step. The bench below lays time out along a ruler: the carriage is your request, and each block is one phase of the round trip. Step through it, or switch to a reused connection to see which phases disappear."
            >
              The life of a call
            </Heading>
            <div className="mt-8">
              <LifeOfACall figure={<TimeRailFigure fig="Fig 2" title="The time rail" />} />
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="one-line" aria-labelledby="line-title" className="scroll-mt-20 py-16">
            <Heading
              id="line-title"
              lead="The gateway speaks the same API as your provider, so your client needs one change: where it sends requests. Your provider key stays in your client."
            >
              Change one line
            </Heading>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <Code label="Before">{BEFORE}</Code>
              <Code label="After">{AFTER}</Code>
            </div>
            <p className="mt-6 max-w-2xl text-sm text-muted">
              To group several calls under a trace you already have, send its id in an{" "}
              <code className="font-mono text-xs text-ink">X-Spanrail-Trace-Id</code> header. The gateway attaches the
              call to that trace instead of starting a new one.
            </p>
            <div className="mt-4 max-w-2xl">
              <Code label="Attach a call to an existing trace">{ATTACH}</Code>
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="what-you-see" aria-labelledby="see-title" className="scroll-mt-20 py-16">
            <Heading
              id="see-title"
              lead="Each call shows up as a trace. The span list puts every step on one time axis, and the detail for a generation opens with its time budget, so the slowest phase is the first thing you read."
            >
              What you see
            </Heading>
            <div className="mt-8">
              <TracePreview />
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="gateway" aria-labelledby="gateway-title" className="scroll-mt-20 py-16">
            <Heading
              id="gateway-title"
              lead="A small proxy written in Go, using the standard library and one metrics dependency. It forwards your request unchanged and reports the call to Spanrail on the side."
            >
              The gateway
            </Heading>
            <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {GATEWAY_FACTS.map((f) => (
                <div key={f.name} className="border-t border-rule pt-4">
                  <dt className="text-base font-semibold">{f.name}</dt>
                  <dd className="mt-1.5 max-w-md text-sm text-muted">{f.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="inside" aria-labelledby="inside-title" className="scroll-mt-20 py-16">
            <Heading id="inside-title">What is in it</Heading>
            <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <div key={c.name} className="border-t border-rule pt-4">
                  <dt className="text-base font-semibold">{c.name}</dt>
                  <dd className="mt-1.5 max-w-md text-sm text-muted">{c.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-16">
            <Heading id="faq-title">Questions</Heading>
            <div className="mt-8 max-w-3xl border-b border-rule">
              {FAQ.map((item) => (
                <details key={item.q} className="group border-t border-rule">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden className="shrink-0 text-muted transition-transform duration-150 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-sm text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="run" aria-labelledby="run-title" className="scroll-mt-20 py-16">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <Heading id="run-title">Run it yourself</Heading>
                <p className="mt-3 max-w-md text-sm text-muted">
                  Spanrail needs Docker. Postgres and Redis come with it, and your traces stay on your own
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

        <aside className="hidden xl:block">
          <div className="pt-16">
            <OnThisPage sections={SECTIONS} />
          </div>
        </aside>
      </div>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <Logo className="text-muted" />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
