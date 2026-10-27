// The time rail's model: pure numbers, no DOM. The carriage position, the dial and the readout all
// come from the same journey data as the stepper (src/lib/callJourney.ts), so the figure cannot
// show a time the page does not say.
import { journeyState } from "@/lib/callJourney";
import type { TimingPhaseKey } from "@/lib/gatewayTiming";

/** World units of rail per millisecond. */
export const K = 0.7;
/** Where 0 ms sits on the rail. */
export const X0 = -132;
/** A phase that happened but would be thinner than this is drawn this wide, so it stays visible. */
export const MIN_SEG = 1.4;
/** Full scale of the dial, in ms. */
export const DIAL_FULL_MS = 400;
/** The dial sweeps 270 degrees: from -135 to +135 degrees about straight up. */
export const DIAL_FROM = -0.75 * Math.PI;
export const DIAL_SPAN = 1.5 * Math.PI;

export interface Seg {
  key: TimingPhaseKey;
  ms: number;
  x0: number;
  w: number;
}

const FRESH = journeyState(6, false);
const REUSED = journeyState(6, true);

/** The five phases end to end on a new connection, as drawn on the rail. */
export const SEGS: Seg[] = (() => {
  let x = X0;
  return FRESH.phases.map((p) => {
    const w = Math.max(p.ms * K, MIN_SEG);
    const seg = { key: p.key, ms: p.ms, x0: x, w };
    x += w;
    return seg;
  });
})();

export const SETUP_KEYS: TimingPhaseKey[] = ["dns", "connect", "tls"];

/** How far the wait and transfer blocks slide back when the three setup phases are not needed. */
export const SETUP_SHIFT = SEGS.filter((s) => SETUP_KEYS.includes(s.key)).reduce((a, s) => a + s.w, 0);

export const TOTAL_FRESH = FRESH.totalMs;
export const TOTAL_REUSED = REUSED.totalMs;

/** The end of the phases that have started, in rail units: where the carriage is. */
export function carriageX(step: number, reused: boolean): number {
  const state = journeyState(step, reused);
  let x = X0;
  for (const p of state.phases) {
    if (p.status === "upcoming") continue;
    const seg = SEGS.find((s) => s.key === p.key);
    if (!seg) continue;
    const shift = reused && !SETUP_KEYS.includes(seg.key) ? SETUP_SHIFT : 0;
    x = seg.x0 + seg.w - shift;
  }
  return x;
}

/** Milliseconds elapsed once the phases that have started are counted. */
export function elapsedMs(step: number, reused: boolean): number {
  return journeyState(step, reused).phases.filter((p) => p.status !== "upcoming").reduce((a, p) => a + p.ms, 0);
}

export function totalMs(reused: boolean): number {
  return reused ? TOTAL_REUSED : TOTAL_FRESH;
}

/** Dial needle angle (radians, 0 = straight up, clockwise) for a time in ms. */
export function needleAngle(ms: number): number {
  const share = Math.min(Math.max(ms / DIAL_FULL_MS, 0), 1);
  return DIAL_FROM + share * DIAL_SPAN;
}

const fmt = (ms: number) => (ms < 10 ? ms.toFixed(1) : String(Math.round(ms)));

export function readoutOf(ms: number, total: number): string {
  return `${fmt(ms)} of ${fmt(total)} ms`;
}
