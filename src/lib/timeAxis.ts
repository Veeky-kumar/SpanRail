// Pure layout helpers for the time-budget ruler. No React, so the rules are unit-testable.
import type { TimingPhase, TimingPhaseKey } from "@/lib/gatewayTiming";

export interface Tick {
  ms: number;
  label: string;
}

const MAX_INTERVALS = 6; // at most 7 ticks including zero

/**
 * Round tick positions for an axis that runs from 0 to spanMs. Steps are 1, 2 or 5 times a
 * power of ten, the first one that fits in MAX_INTERVALS. From 5 s upward the labels are in
 * seconds so they stay short; `unit` says which one the caller should print once.
 */
export function niceTicks(spanMs: number): { ticks: Tick[]; unit: "ms" | "s" } {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return { ticks: [{ ms: 0, label: "0" }], unit: "ms" };

  const unit = spanMs >= 5000 ? "s" : "ms";
  const scale = unit === "s" ? 1000 : 1;
  const span = spanMs / scale;

  const top = Math.floor(Math.log10(span));
  let step = Math.pow(10, top);
  search: for (let exp = top - 3; exp <= top; exp++) {
    for (const m of [1, 2, 5]) {
      const candidate = m * Math.pow(10, exp);
      if (Math.floor(span / candidate + 1e-9) <= MAX_INTERVALS) {
        step = candidate;
        break search;
      }
    }
  }

  const decimals = step < 1 ? Math.ceil(-Math.log10(step) - 1e-9) : 0;
  const count = Math.floor(span / step + 1e-9);
  const ticks: Tick[] = [];
  for (let i = 0; i <= count; i++) {
    const value = Number((i * step).toFixed(6));
    ticks.push({ ms: value * scale, label: i === 0 ? "0" : value.toFixed(decimals) });
  }
  return { ticks, unit };
}

export interface PhaseSegment {
  key: TimingPhaseKey;
  startPct: number;
  widthPct: number;
}

/**
 * Lays phases end to end on a 0-100% track. Width is proportional to duration against the
 * larger of the total and the phase sum (so clock skew can never overflow the track). A
 * phase that did happen but is too small to see gets minPct, and the others shrink to make
 * room. Time not covered by any phase stays empty rather than being stretched.
 */
export function phaseLayout(phases: TimingPhase[], totalMs: number, minPct = 1.5): PhaseSegment[] {
  const active = phases.filter((p) => p.ms > 0);
  if (!(totalMs > 0) || active.length === 0) return [];

  const denom = Math.max(totalMs, active.reduce((a, p) => a + p.ms, 0));
  const raw = active.map((p) => (p.ms / denom) * 100);

  const smallCount = raw.filter((w) => w < minPct).length;
  const bigSum = raw.reduce((a, w) => (w < minPct ? a : a + w), 0);
  const used = smallCount * minPct;
  const scale = bigSum > 0 && used + bigSum > 100 ? (100 - used) / bigSum : 1;

  let start = 0;
  return active.map((p, i) => {
    const widthPct = raw[i] < minPct ? minPct : raw[i] * scale;
    const seg = { key: p.key, startPct: start, widthPct };
    start += widthPct;
    return seg;
  });
}

/** The phase that took longest, or null when no phase took any time. */
export function slowestPhase(phases: TimingPhase[]): TimingPhase | null {
  let best: TimingPhase | null = null;
  for (const p of phases) if (p.ms > 0 && (best === null || p.ms > best.ms)) best = p;
  return best;
}
