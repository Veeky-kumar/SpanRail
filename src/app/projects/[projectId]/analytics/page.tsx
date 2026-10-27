import Link from "next/link";
import {
  getDailyTraceVolume,
  getDailyCost,
  getTopModels,
  getOverviewStats,
} from "@/server/analytics";
import { StatTile } from "@/components/charts/StatTile";
import { ChartCard } from "@/components/charts/ChartCard";
import { DailyBarChart } from "@/components/charts/DailyBarChart";
import { DailyLineChart } from "@/components/charts/DailyLineChart";
import { TopModelsBarChart } from "@/components/charts/TopModelsBarChart";
import { formatCompactNumber, formatCompactCurrency, formatPercent, formatMs, formatShortDate } from "@/lib/chartFormat";

const PRESETS = [7, 14, 30] as const;

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { projectId } = await params;
  const { days: daysParam } = await searchParams;
  const days = PRESETS.includes(Number(daysParam) as (typeof PRESETS)[number]) ? Number(daysParam) : 14;

  const [stats, volume, cost, topModels] = await Promise.all([
    getOverviewStats(projectId, days),
    getDailyTraceVolume(projectId, days),
    getDailyCost(projectId, days),
    getTopModels(projectId, days),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Analytics</h2>
        <div role="group" aria-label="Date range" className="flex gap-0.5 rounded-data border border-rule bg-canvas p-0.5">
          {PRESETS.map((p) => (
            <Link
              key={p}
              href={`/projects/${projectId}/analytics?days=${p}`}
              aria-current={p === days ? "true" : undefined}
              className={`pressable rounded-[2px] px-3 py-1.5 text-xs tabular-nums transition-colors duration-150 ${
                p === days ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {p}d
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-data border border-rule bg-rule lg:grid-cols-4">
        <StatTile label={`Traces (${days}d)`} value={formatCompactNumber(stats.traceCount)} />
        <StatTile
          label="Error rate"
          value={formatPercent(stats.errorRate)}
          tone={stats.errorRate > 0.05 ? "critical" : undefined}
        />
        <StatTile label="Total cost" value={formatCompactCurrency(stats.totalCost)} />
        <StatTile label="p50 / p95 latency" value={`${formatMs(stats.p50LatencyMs)} / ${formatMs(stats.p95LatencyMs)}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Trace volume"
          table={
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Traces</th>
                </tr>
              </thead>
              <tbody>
                {volume.map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="py-1">{formatShortDate(d.date)}</td>
                    <td className="py-1">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <DailyBarChart data={volume} />
        </ChartCard>

        <ChartCard
          title="Cost per day"
          table={
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {cost.map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="py-1">{formatShortDate(d.date)}</td>
                    <td className="py-1">{formatCompactCurrency(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <DailyLineChart data={cost} valueType="currency" />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title="Top models by generation count"
          table={
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Model</th>
                  <th className="py-1 font-medium">Generations</th>
                  <th className="py-1 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {topModels.map((m) => (
                  <tr key={m.model} className="border-t border-border">
                    <td className="py-1">{m.model}</td>
                    <td className="py-1">{m.generationCount}</td>
                    <td className="py-1">{formatCompactCurrency(m.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <TopModelsBarChart data={topModels} />
        </ChartCard>
      </div>
    </div>
  );
}
