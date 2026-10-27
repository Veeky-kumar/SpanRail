import Link from "next/link";
import { TimeRailFigure } from "@/components/landing/timeRail/figure";
import { formatRelativeTime } from "@/lib/format";
import { slowestPhase } from "@/lib/timeAxis";
import type { SetupStep } from "@/lib/setupProgress";
import type { LatestCall as Latest } from "@/server/home";

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

/**
 * The home page's hero: the user's own newest gateway-measured call on the time rail, drawn from the
 * numbers the gateway stored. With no such call yet it shows the labelled sample and says how to get one.
 */
export function LatestCall({ latest, next }: { latest: Latest | null; next: SetupStep | null }) {
  if (!latest) {
    return (
      <div>
        <TimeRailFigure
          fig="Fig 1"
          title="Sample call"
          hint="Your call will appear here"
          fixedStep={6}
          slideIn
          caption="A sample call, drawn on the time rail. Route a client through the gateway and your own latest call replaces it, with the milliseconds the gateway measured. Sample data."
        />
        <p className="mt-4 max-w-2xl text-sm text-muted">
          {next ? (
            <>
              Next: <span className="font-medium text-ink">{next.title.toLowerCase()}</span>. {next.detail}
            </>
          ) : (
            "Send a call through the gateway to see its time budget here."
          )}
        </p>
      </div>
    );
  }

  const { timing } = latest;
  const slowest = slowestPhase(timing.phases);
  const share = slowest && timing.totalMs > 0 ? Math.round((slowest.ms / timing.totalMs) * 100) : null;
  const when = formatRelativeTime(latest.startTime);

  return (
    <div>
      <TimeRailFigure
        timing={timing}
        fig="Fig 1"
        title="Your latest call"
        hint="Measured by the gateway"
        fixedStep={6}
        caption={`Your newest call through the gateway${latest.model ? `, ${latest.model}` : ""}, in ${latest.projectName}, ${when}. The carriage rides a ruler across one block per phase of the round trip, drawn from the milliseconds the gateway measured.`}
      />
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
        <p className="max-w-xl text-muted">
          {slowest && share !== null ? (
            <>
              Slowest phase: <span className="font-medium text-ink">{slowest.label}</span>, {fmt(slowest.ms)} ({share}% of the call).
            </>
          ) : (
            "No phase took measurable time."
          )}
          {timing.status !== null ? <> The provider answered {timing.status}.</> : null}
        </p>
        <Link
          href={`/projects/${encodeURIComponent(latest.projectId)}/traces/${encodeURIComponent(latest.traceId)}`}
          className="font-medium underline underline-offset-4 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Open this trace
        </Link>
      </div>
    </div>
  );
}
