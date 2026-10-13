import Link from "next/link";
import { getProjectTraceSummaries } from "@/server/queries";
import { formatDuration, formatRelativeTime, formatCost } from "@/lib/format";
import { StatusDot } from "@/components/StatusDot";

export default async function ProjectTracesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const traces = await getProjectTraceSummaries(projectId);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted">Recent traces</h2>
        <span className="text-xs text-muted">{traces.length} shown</span>
      </div>

      {traces.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted">
          No traces yet. Send a trace with the SDK and it will show up here within a couple seconds.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Spans</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Cost</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.traceId} className="border-b border-border last:border-b-0">
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
                  <td className="px-4 py-3 text-muted">{t.observationCount}</td>
                  <td className="px-4 py-3 text-muted">{formatDuration(t.durationMs)}</td>
                  <td className="px-4 py-3 text-muted">{formatCost(t.totalCost)}</td>
                  <td className="px-4 py-3 text-muted">{formatRelativeTime(t.startTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
