// The time rail's model: pure numbers, no DOM. It is built from one call's timing (the sample on the
// landing page, a real gateway-reported call on the home page), so the carriage position, the dial and
// the readout always come from the numbers the page states. Everything the figure draws scales to the
// call: the ruler and the dial run to the next round number above its total, whether that is 20 ms or 60 s.
import { STAGES, journeyState } from "@/lib/callJourney";
import type { GatewayTiming, TimingPhaseKey } from "@/lib/gatewayTiming";
import { niceTicks } from "@/lib/timeAxis";

/** Where 0 ms sits on the rail, in world units. */
export const X0 = -132;
/** Length of the graduated ruler, in world units, whatever time it stands for. */
export const RULER_LEN = 280;
/** A phase that happened but would be thinner than this is drawn this wide, so it stays visible. */
export const MIN_SEG = 1.4;
/** The dial sweeps 270 degrees: from -135 to +135 degrees about straight up. */
export const DIAL_FROM = -0.75 * Math.PI;
export const DIAL_SPAN = 1.5 * Math.PI;

export const SETUP_KEYS: TimingPhaseKey[] = ["dns", "connect", "tls"];

export interface Seg {
  key: TimingPhaseKey;
  ms: number;
  x0: number;
  w: number;
}

export interface RailModel {
  /** The call this rail stands for (plain data, safe to pass from server to client). */
  timing: GatewayTiming;
  /** The phases that happened, end to end as drawn on a new connection. */
  segs: Seg[];
  /** World units of rail per millisecond. */
  k: number;
  /** What the ruler and the dial run to, in ms: the next major tick at or above the total. */
  spanMs: number;
  /** Distance between major ticks, in ms. */
  tickMs: number;
  unit: "ms" | "s";
  /** Time taken by the setup phases (DNS, connect, TLS), and the rail length they occupy. */
  setupMs: number;
  setupShift: number;
  totalFresh: number;
  totalReused: number;
  /** Phases drawn wider than their true length so they stay visible. */
  widened: TimingPhaseKey[];
}

export function railOf(timing: GatewayTiming): RailModel {
  const sum = timing.phases.reduce((a, p) => a + p.ms, 0);
  const total = timing.totalMs > 0 ? timing.totalMs : Math.max(sum, 1);
  const { ticks, unit } = niceTicks(total);
  const tickMs = ticks.length > 1 ? ticks[1].ms - ticks[0].ms : total;
  const spanMs = Math.max(Math.ceil(total / tickMs - 1e-9), 1) * tickMs;
  const k = RULER_LEN / spanMs;

  let x = X0;
  const widened: TimingPhaseKey[] = [];
  const segs: Seg[] = timing.phases
    .filter((p) => p.ms > 0)
    .map((p) => {
      const truth = p.ms * k;
      const w = Math.max(truth, MIN_SEG);
      if (truth < MIN_SEG) widened.push(p.key);
      const seg = { key: p.key, ms: p.ms, x0: x, w };
      x += w;
      return seg;
    });

  const setup = timing.phases.filter((p) => SETUP_KEYS.includes(p.key));
  const setupMs = setup.reduce((a, p) => a + p.ms, 0);
  const setupShift = segs.filter((s) => SETUP_KEYS.includes(s.key)).reduce((a, s) => a + s.w, 0);

  return { timing, segs, k, spanMs, tickMs, unit, setupMs, setupShift, totalFresh: total, totalReused: total - setupMs, widened };
}

/** The end of the phases that have started, in rail units: where the carriage is. */
export function carriageX(model: RailModel, step: number, reused: boolean): number {
  const state = journeyState(step, reused, model.timing);
  let x = X0;
  for (const p of state.phases) {
    if (p.status === "upcoming") continue;
    const seg = model.segs.find((s) => s.key === p.key);
    if (!seg) continue;
    const shift = reused && !SETUP_KEYS.includes(seg.key) ? model.setupShift : 0;
    x = seg.x0 + seg.w - shift;
  }
  return x;
}

/** Milliseconds elapsed once the phases that have started are counted. */
export function elapsedMs(model: RailModel, step: number, reused: boolean): number {
  return journeyState(step, reused, model.timing)
    .phases.filter((p) => p.status !== "upcoming")
    .reduce((a, p) => a + p.ms, 0);
}

export function totalMs(model: RailModel, reused: boolean): number {
  return reused ? model.totalReused : model.totalFresh;
}

/** Dial needle angle (radians, 0 = straight up, clockwise) for a time in ms. */
export function needleAngle(model: RailModel, ms: number): number {
  const share = Math.min(Math.max(ms / model.spanMs, 0), 1);
  return DIAL_FROM + share * DIAL_SPAN;
}

const fmt = (ms: number) => (ms < 10 ? ms.toFixed(1) : String(Math.round(ms)));

/** "267 of 374 ms"; from one second up the readout switches to seconds so the numbers stay short. */
export function readoutOf(ms: number, total: number): string {
  if (total >= 1000) {
    const digits = total >= 10_000 ? 1 : 2;
    return `${(ms / 1000).toFixed(digits)} of ${(total / 1000).toFixed(digits)} s`;
  }
  return `${fmt(ms)} of ${fmt(total)} ms`;
}

export interface TourBeat {
  /** The stage of the call to show (an index into STAGES). */
  step: number;
  /** How long to stay there, in ms. */
  dwellMs: number;
}

/**
 * The idle replay of a call: the request, then each phase that actually happened, then the report.
 * A long phase is held longer than a short one (so the pace echoes the call), and the finished call is
 * held longest before the replay loops.
 */
export function tourOf(model: RailModel): TourBeat[] {
  const beats: TourBeat[] = [{ step: 0, dwellMs: 900 }];
  STAGES.forEach((stage, step) => {
    if (!stage.phase) return; // the request and the report are the two ends
    const seg = model.segs.find((s) => s.key === stage.phase);
    if (!seg) return; // that phase did not happen on this call
    beats.push({ step, dwellMs: Math.round(700 + 2000 * (seg.ms / Math.max(model.totalFresh, 1))) });
  });
  beats.push({ step: STAGES.length - 1, dwellMs: 3400 });
  return beats;
}
