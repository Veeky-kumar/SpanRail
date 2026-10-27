// Turns many gateway-timed calls into the numbers the Gateway tab draws: the average call split into phases,
// the spread of call durations, and how often a connection was reused. Phases come from parseGatewayTiming, so the
// meaning of "wait" and "transfer" is defined in one place. A phase that did not happen in a call (a reused
// connection has no DNS, connect or TLS) counts as 0 ms in that call, so the means describe the average call.
import { parseGatewayTiming, type GatewayTiming, type TimingPhaseKey } from "./gatewayTiming";

export const PHASE_ORDER: TimingPhaseKey[] = ["dns", "connect", "tls", "wait", "transfer"];

export interface HistogramBin {
  fromMs: number;
  toMs: number;
  count: number;
}

export interface TimingSummary {
  calls: number;
  meanMs: Record<TimingPhaseKey, number>;
  meanTotalMs: number;
  p50Ms: number;
  p95Ms: number;
  /** Share of calls that reused a connection, among calls that say either way; null when none do. */
  reusedShare: number | null;
  /** Equal-width bins from 0; the last bin also holds every longer call. */
  bins: HistogramBin[];
}

/** Linear-interpolated percentile of an ascending array, p in 0..1. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarizeTimings(timings: GatewayTiming[], binCount = 24): TimingSummary | null {
  if (timings.length === 0) return null;
  const n = timings.length;
  const sums: Record<TimingPhaseKey, number> = { dns: 0, connect: 0, tls: 0, wait: 0, transfer: 0 };
  let reused = 0;
  let reusedKnown = 0;
  for (const t of timings) {
    for (const p of t.phases) sums[p.key] += p.ms;
    if (t.connReused !== null) {
      reusedKnown += 1;
      if (t.connReused) reused += 1;
    }
  }
  const meanMs = Object.fromEntries(PHASE_ORDER.map((k) => [k, sums[k] / n])) as Record<TimingPhaseKey, number>;
  const totals = timings.map((t) => t.totalMs).sort((a, b) => a - b);

  // The axis ends at the 99th percentile, so one stuck request cannot flatten the whole picture.
  const top = Math.max(1, percentile(totals, 0.99));
  const width = Math.max(1, Math.ceil(top / binCount));
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({ fromMs: i * width, toMs: (i + 1) * width, count: 0 }));
  for (const v of totals) bins[Math.min(binCount - 1, Math.floor(v / width))].count += 1;

  return {
    calls: n,
    meanMs,
    meanTotalMs: totals.reduce((a, b) => a + b, 0) / n,
    p50Ms: percentile(totals, 0.5),
    p95Ms: percentile(totals, 0.95),
    reusedShare: reusedKnown > 0 ? reused / reusedKnown : null,
    bins,
  };
}

/** Parses stored `metadata.gateway` objects and drops any that carry no valid timing. */
export function timingsOf(gateways: unknown[]): GatewayTiming[] {
  const out: GatewayTiming[] = [];
  for (const g of gateways) {
    const t = parseGatewayTiming({ gateway: g });
    if (t) out.push(t);
  }
  return out;
}
