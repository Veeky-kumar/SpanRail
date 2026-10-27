import Link from "next/link";
import { getGatewayCalls, getGatewayModels } from "@/server/analytics";
import { AnalyticsHeader, daysFrom } from "@/components/analytics/AnalyticsHeader";
import { TimeBudget } from "@/components/analytics/TimeBudget";
import { summarizeTimings, timingsOf } from "@/lib/timingSummary";

export const metadata = { title: "Gateway timing" };

const SAMPLE_LIMIT = 5000;

export default async function GatewayPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string; model?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const days = daysFrom(sp.days);

  const models = await getGatewayModels(projectId, days);
  // Only a model that really has gateway calls can be selected, so a stale or mistyped link falls back to all models.
  const selected = sp.model && models.some((m) => m.model === sp.model) ? sp.model : null;
  const { gateways, total } = await getGatewayCalls(projectId, days, selected, SAMPLE_LIMIT);
  const summary = summarizeTimings(timingsOf(gateways));

  return (
    <div>
      <AnalyticsHeader projectId={projectId} days={days} active="gateway" extraQuery={selected ? `&model=${encodeURIComponent(selected)}` : ""} />
      {!summary ? (
        <div className="mt-8 rounded-data border border-dashed border-rule p-8">
          <h3 className="text-lg font-semibold tracking-[-0.01em]">No gateway calls in the last {days} days</h3>
          <p className="mt-2 max-w-xl text-sm text-muted">
            This view shows where an LLM call spends its time: DNS, connect, TLS, the provider&apos;s wait and the transfer back. The
            Spanrail gateway measures those for every call that passes through it. Start the gateway with your project key, send one
            request through it, and this fills in.
          </p>
          <p className="mt-3 text-sm">
            <Link href={`/projects/${projectId}/settings`} className="font-medium underline underline-offset-4 hover:text-accent">
              Create an API key in Settings
            </Link>
          </p>
        </div>
      ) : (
        <>
          {total > SAMPLE_LIMIT && (
            <p className="mt-4 text-xs text-muted">
              Showing the most recent {SAMPLE_LIMIT.toLocaleString()} of {total.toLocaleString()} gateway calls in this period.
            </p>
          )}
          <div className="mt-2">
            <TimeBudget summary={summary} models={models} selected={selected} base={`/projects/${projectId}/analytics/gateway?days=${days}`} />
          </div>
        </>
      )}
    </div>
  );
}
