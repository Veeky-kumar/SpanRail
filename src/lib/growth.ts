// Pure shaping for the admin growth page. The numbers themselves come from src/server/growth.ts.
export type FunnelStepId = "signed-up" | "project" | "api-key" | "first-trace" | "gateway-call";

export interface StepFlags {
  project: boolean;
  apiKey: boolean;
  trace: boolean;
  gateway: boolean;
}

export function furthestStep(f: StepFlags): FunnelStepId {
  if (f.gateway) return "gateway-call";
  if (f.trace) return "first-trace";
  if (f.apiKey) return "api-key";
  if (f.project) return "project";
  return "signed-up";
}

export interface FunnelCounts {
  signedUp: number;
  project: number;
  apiKey: number;
  trace: number;
  gateway: number;
}

export interface FunnelStep {
  id: FunnelStepId;
  label: string;
  count: number;
  /** Share of everyone who signed up; null when nobody has. */
  pctOfSignups: number | null;
  /** Share of the step before it; null for the first step or when the step before is empty. */
  pctOfPrevious: number | null;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function funnelOf(c: FunnelCounts): FunnelStep[] {
  const steps: { id: FunnelStepId; label: string; count: number }[] = [
    { id: "signed-up", label: "Signed up", count: c.signedUp },
    { id: "project", label: "Created a project", count: c.project },
    { id: "api-key", label: "Created an API key", count: c.apiKey },
    { id: "first-trace", label: "Sent a trace", count: c.trace },
    { id: "gateway-call", label: "Sent a gateway call", count: c.gateway },
  ];
  return steps.map((s, i) => ({
    ...s,
    pctOfSignups: c.signedUp > 0 ? round((s.count / c.signedUp) * 100) : null,
    pctOfPrevious: i > 0 && steps[i - 1].count > 0 ? round((s.count / steps[i - 1].count) * 100) : null,
  }));
}

export function sourceLabel(s: { referrer: string | null; utmSource: string | null }): string {
  return s.utmSource ?? s.referrer ?? "direct";
}
