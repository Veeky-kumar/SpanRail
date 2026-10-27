import Link from "next/link";
import { getProjectTraceSummaries } from "@/server/queries";
import { formatDuration, formatRelativeTime, formatCost } from "@/lib/format";
import { StatusDot } from "@/components/StatusDot";

export default async function ProjectTracesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const traces = await getProjectTraceSummaries(projectId);
  // Duration bars share one scale (the slowest trace shown) so rows compare at a glance.
  const slowestMs = traces.reduce((m, t) => Math.max(m, t.durationMs ?? 0), 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight">Recent traces</h2>
        <span className="text-xs tabular-nums text-muted">{traces.length} shown</span>
      </div>

      {traces.length === 0 ? (
        <div className="mt-6 rounded-data border border-rule bg-surface px-5 py-10 text-center text-sm text-muted">
          No traces yet. Send a trace with the SDK, or point an OpenAI-compatible client at the gateway, and it will
          show up here within a couple of seconds.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-data border border-rule bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs text-muted">
                <th className="w-10 px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 text-right font-medium">Spans</th>
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                <th className="hidden w-36 px-4 py-2.5 font-medium md:table-cell">
                  <span className="sr-only">Duration compared with the slowest trace shown</span>
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                <th className="px-4 py-2.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.traceId} className="border-b border-border transition-colors duration-100 last:border-b-0 hover:bg-canvas/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${projectId}/traces/${t.traceId}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <StatusDot hasError={t.hasError} hasWarning={t.hasWarning} />
                    </Link>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <Link
                      href={`/projects/${projectId}/traces/${t.traceId}`}
                      title={t.name ?? undefined}
                      className="block truncate font-medium hover:underline"
                    >
                      {t.name ?? "(unnamed trace)"}
                    </Link>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-muted" title={t.userId ?? undefined}>
                    {t.userId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{t.observationCount}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatDuration(t.durationMs)}</td>
                  <td className="hidden px-4 py-3 md:table-cell" aria-hidden>
                    <div className="h-2 w-28 rounded-[2px] bg-border">
                      <div
                        className={`h-full rounded-[2px] ${t.hasError ? "bg-fault" : "bg-t4"}`}
                        style={{ width: `${slowestMs > 0 && t.durationMs !== null ? Math.max((t.durationMs / slowestMs) * 100, 2) : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCost(t.totalCost)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{formatRelativeTime(t.startTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
