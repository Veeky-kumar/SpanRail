import Link from "next/link";
import { CHANGELOG_LIMIT } from "@/components/home/constants";
import { doneCount, nextStepOf, type SetupStep } from "@/lib/setupProgress";
import { recentChanges } from "@/lib/changelog";
import type { WorkspaceSummary } from "@/server/home";

const REPO = "https://github.com/Veeky-kumar/spanrail";

const GUIDES = [
  { label: "Quick start (local)", href: `${REPO}#quick-start-local-development` },
  { label: "Deploy with Docker", href: `${REPO}#full-containerized-deployment` },
  { label: "Run the gateway", href: `${REPO}/blob/main/gateway/README.md` },
  { label: "How it is built", href: `${REPO}/blob/main/ARCHITECTURE.md` },
];

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value.toLocaleString("en")}</dd>
    </div>
  );
}

function Check({ done }: { done: boolean }) {
  // Shape as well as colour: a filled square when done, an empty ring when not.
  return (
    <span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-[2px] ${done ? "bg-accent" : "border border-muted"}`} />
  );
}

/** The left column of the home page: real numbers, a derived checklist, guides and what shipped. */
export function HomeRail({ summary, steps }: { summary: WorkspaceSummary; steps: SetupStep[] }) {
  const next = nextStepOf(steps);
  return (
    <aside className="order-2 space-y-8 pb-16 xl:order-1 xl:pt-16">
      <section aria-labelledby="workspace-title">
        <h2 id="workspace-title" className="text-sm font-semibold">
          Your workspace
        </h2>
        <dl className="mt-2 divide-y divide-border border-y border-rule">
          <Stat label="Projects" value={summary.projects} />
          <Stat label="Traces, last 7 days" value={summary.traces7d} />
          <Stat label="Gateway calls, last 7 days" value={summary.gatewayCalls7d} />
        </dl>
      </section>

      <section id="getting-started" aria-labelledby="start-title" className="scroll-mt-20">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="start-title" className="text-sm font-semibold">
            Getting started
          </h2>
          <span className="text-xs tabular-nums text-muted">
            {doneCount(steps)} of {steps.length} done
          </span>
        </div>
        <ol className="mt-2 space-y-3">
          {steps.map((s) => (
            <li key={s.id} className="flex gap-2.5 text-sm">
              <Check done={s.done} />
              <div className="min-w-0">
                <p className={s.done ? "text-muted line-through" : "font-medium"}>
                  {s.href && !s.done ? (
                    <Link href={s.href} className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                      {s.title}
                    </Link>
                  ) : (
                    s.title
                  )}
                  <span className="sr-only">{s.done ? " (done)" : s.id === next?.id ? " (next)" : ""}</span>
                </p>
                {s.id === next?.id ? <p className="mt-0.5 text-xs text-muted">{s.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="guides" aria-labelledby="guides-title" className="scroll-mt-20">
        <h2 id="guides-title" className="text-sm font-semibold">
          Self-hosting guides
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <a
                href={g.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {g.label}
                <span className="sr-only"> (opens GitHub in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section id="whats-new" aria-labelledby="new-title" className="scroll-mt-20">
        <h2 id="new-title" className="text-sm font-semibold">
          What&apos;s new
        </h2>
        <ul className="mt-2 space-y-3">
          {recentChanges(CHANGELOG_LIMIT).map((c) => (
            <li key={c.title} className="text-sm">
              <p>{c.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                <time dateTime={c.date}>{formatDay(c.date)}</time>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
