import { getModelBreakdown } from "@/server/analytics";
import { AnalyticsHeader, daysFrom } from "@/components/analytics/AnalyticsHeader";
import { ModelWorkbench } from "@/components/analytics/ModelWorkbench";
import { modelInsights } from "@/lib/insights";

export const metadata = { title: "Models" };

export default async function ModelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { projectId } = await params;
  const days = daysFrom((await searchParams).days);
  const { dates, daily, table } = await getModelBreakdown(projectId, days);

  return (
    <div>
      <AnalyticsHeader projectId={projectId} days={days} active="models" />
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em]">Which models cost what, and how they behave</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Turn models off to see the rest on their own. Cost is what your SDK or gateway reported; a model with no reported cost shows $0.
      </p>
      <ModelWorkbench
        dates={dates}
        models={table}
        daily={daily}
        days={days}
        insights={modelInsights(
          table.map((m) => ({ model: m.model, cost: m.cost, prevCost: m.prevCost, generations: m.generations, errors: m.errors })),
        )}
      />
    </div>
  );
}
