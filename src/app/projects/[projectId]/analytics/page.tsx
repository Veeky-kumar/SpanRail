import {
  getDailyCost,
  getDailyHealth,
  getHourlyHeat,
  getOverviewStats,
  getTopModels,
} from "@/server/analytics";
import { AnalyticsHeader, daysFrom } from "@/components/analytics/AnalyticsHeader";
import { Kpi } from "@/components/analytics/Kpi";
import { TracesChart } from "@/components/analytics/TracesChart";
import { LatencyChart } from "@/components/analytics/LatencyChart";
import { Heatmap } from "@/components/analytics/Heatmap";
import { ChartCard } from "@/components/charts/ChartCard";
import { DailyLineChart } from "@/components/charts/DailyLineChart";
import { TopModelsBarChart } from "@/components/charts/TopModelsBarChart";
import { formatCompactNumber, formatCompactCurrency, formatMs, formatPercent, formatShortDate } from "@/lib/chartFormat";
import { pctChange } from "@/lib/series";

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted">
          {head.map((h) => (
            <th key={h} className="py-1 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, n) => (
          <tr key={n} className="border-t border-border">
            {r.map((c, i) => (
              <td key={i} className="py-1">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { projectId } = await params;
  const days = daysFrom((await searchParams).days);

  const [stats, before, health, cost, topModels, heat] = await Promise.all([
    getOverviewStats(projectId, days),
    getOverviewStats(projectId, days, 1),
    getDailyHealth(projectId, days),
    getDailyCost(projectId, days),
    getTopModels(projectId, days),
    getHourlyHeat(projectId, days),
  ]);

  const perTrace = stats.traceCount > 0 ? stats.totalCost / stats.traceCount : 0;
  const perTraceBefore = before.traceCount > 0 ? before.totalCost / before.traceCount : 0;
  const traceChange = pctChange(stats.traceCount, before.traceCount);

  // One sentence that says what the page shows, so the first thing read is the answer, not a grid of numbers.
  const headline =
    stats.traceCount === 0
      ? "No traces in this period yet."
      : traceChange === null
        ? `${formatCompactNumber(stats.traceCount)} traces in the last ${days} days, costing ${formatCompactCurrency(stats.totalCost)}.`
        : `Traces are ${traceChange >= 0 ? "up" : "down"} ${Math.abs(traceChange * 100).toFixed(0)}% on the ${days} days before, and spend is ${formatCompactCurrency(stats.totalCost)}.`;

  return (
    <div>
      <AnalyticsHeader projectId={projectId} days={days} active="overview" />

      <p className="mt-5 max-w-3xl text-xl font-semibold leading-snug tracking-[-0.01em]">{headline}</p>
      <p className="mt-1 text-sm text-muted">
        Last {days} days
        {stats.p95LatencyMs !== null ? `. The slowest 1 in 20 traces took ${formatMs(stats.p95LatencyMs)} or more.` : "."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-data border border-rule bg-rule lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label={`Traces (${days}d)`} value={formatCompactNumber(stats.traceCount)} change={traceChange} trend={health.map((d) => d.traces)} />
        <Kpi
          label="Error rate"
          value={formatPercent(stats.errorRate)}
          change={pctChange(stats.errorRate, before.errorRate)}
          lowerIsBetter
          tone={stats.errorRate > 0.05 ? "critical" : undefined}
          trend={health.map((d) => (d.traces > 0 ? d.errorTraces / d.traces : 0))}
        />
        <Kpi label="Latency p50" value={formatMs(stats.p50LatencyMs)} change={stats.p50LatencyMs !== null && before.p50LatencyMs !== null ? pctChange(stats.p50LatencyMs, before.p50LatencyMs) : null} lowerIsBetter trend={health.map((d) => d.p50Ms ?? 0)} />
        <Kpi label="Latency p95" value={formatMs(stats.p95LatencyMs)} change={stats.p95LatencyMs !== null && before.p95LatencyMs !== null ? pctChange(stats.p95LatencyMs, before.p95LatencyMs) : null} lowerIsBetter trend={health.map((d) => d.p95Ms ?? 0)} />
        <Kpi label="Total cost" value={formatCompactCurrency(stats.totalCost)} change={pctChange(stats.totalCost, before.totalCost)} lowerIsBetter trend={cost.map((d) => d.value)} />
        <Kpi
          label="Cost per 1k traces"
          value={formatCompactCurrency(perTrace * 1000)}
          change={pctChange(perTrace, perTraceBefore)}
          lowerIsBetter
          trend={cost.map((d, i) => (health[i].traces > 0 ? d.value / health[i].traces : 0))}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <ChartCard
            title="Trace volume"
            table={
              <DataTable
                head={["Date", "Traces", "Failed"]}
                rows={health.map((d) => [formatShortDate(d.date), d.traces, d.errorTraces])}
              />
            }
          >
            <TracesChart data={health.map((d) => ({ date: d.date, traces: d.traces, errorTraces: d.errorTraces }))} />
          </ChartCard>
        </div>
        <ChartCard
          title="Cost per day"
          table={<DataTable head={["Date", "Cost"]} rows={cost.map((d) => [formatShortDate(d.date), formatCompactCurrency(d.value)])} />}
        >
          <DailyLineChart data={cost} valueType="currency" />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Latency, typical and slow"
          table={
            <DataTable
              head={["Date", "p50", "p95"]}
              rows={health.map((d) => [formatShortDate(d.date), formatMs(d.p50Ms), formatMs(d.p95Ms)])}
            />
          }
        >
          <LatencyChart data={health.map((d) => ({ date: d.date, p50Ms: d.p50Ms, p95Ms: d.p95Ms }))} />
        </ChartCard>
        <ChartCard
          title="Top models by generation count"
          table={
            <DataTable
              head={["Model", "Generations", "Cost"]}
              rows={topModels.map((m) => [m.model, m.generationCount, formatCompactCurrency(m.totalCost)])}
            />
          }
        >
          <TopModelsBarChart data={topModels} />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title="When calls arrive"
          table={
            <DataTable
              head={["Weekday", "Hour (UTC)", "Traces"]}
              rows={[...heat].sort((a, b) => b.count - a.count).slice(0, 24).map((h) => [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][h.dow - 1], String(h.hour).padStart(2, "0") + ":00", h.count])}
            />
          }
        >
          <Heatmap rows={heat} />
        </ChartCard>
      </div>
    </div>
  );
}
