import { parseGatewayTiming, type TimingPhaseKey } from "@/lib/gatewayTiming";
import { niceTicks, phaseLayout, slowestPhase } from "@/lib/timeAxis";

// One hue, one fixed step per phase (tokens --t1..--t5 in globals.css), so a colour always
// means the same part of the round trip. Colour is never the only carrier: the slowest phase
// is named on the ruler and every phase is listed in the table with its value and share.
export const PHASE_BG: Record<TimingPhaseKey, string> = {
  dns: "bg-t1",
  connect: "bg-t2",
  tls: "bg-t3",
  wait: "bg-t4",
  transfer: "bg-t5",
};

function fmt(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Where the time went for a call that passed through the Tracewell gateway: the phases of
 * the round trip laid end to end on a millisecond ruler. Renders nothing for observations
 * that carry no gateway timing, so existing traces are unaffected.
 */
export function GatewayTiming({ metadata }: { metadata: unknown }) {
  const timing = parseGatewayTiming(metadata);
  if (!timing) return null;

  const sum = timing.phases.reduce((a, p) => a + p.ms, 0);
  const span = Math.max(timing.totalMs, sum);
  const layout = phaseLayout(timing.phases, timing.totalMs);
  const { ticks, unit } = niceTicks(span);
  const slowest = slowestPhase(timing.phases);
  const slowestSeg = slowest ? layout.find((s) => s.key === slowest.key) : undefined;
  const summary = timing.phases.map((p) => `${p.label} ${fmt(p.ms)}`).join(", ");

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">Time budget</h4>
        <span className="flex gap-3 text-xs tabular-nums text-muted">
          <span>
            <span className="font-medium text-ink">{fmt(timing.totalMs)}</span> at the gateway
          </span>
          <span>Scale in {unit}</span>
        </span>
      </div>

      {layout.length > 0 && (
        <div
          role="img"
          aria-label={`Time budget, total ${fmt(timing.totalMs)}: ${summary}`}
          className="mt-3"
        >
          <div className="relative h-7 overflow-hidden rounded border border-rule bg-canvas">
            {layout.map((s) => {
              const phase = timing.phases.find((p) => p.key === s.key)!;
              return (
                <div
                  key={s.key}
                  title={`${phase.label}: ${fmt(phase.ms)}`}
                  className={`absolute inset-y-0 ${PHASE_BG[s.key]}`}
                  style={{
                    left: `${s.startPct}%`,
                    width: `${s.widthPct}%`,
                    boxShadow: "inset -1px 0 0 rgb(var(--surface))",
                  }}
                />
              );
            })}
          </div>

          {slowest && slowestSeg && (
            <div className="relative mt-1 h-5 text-xs tabular-nums">
              <span
                className="absolute top-0 whitespace-nowrap font-medium"
                style={
                  slowestSeg.startPct + slowestSeg.widthPct / 2 > 55
                    ? { right: `${100 - (slowestSeg.startPct + slowestSeg.widthPct)}%` }
                    : { left: `${slowestSeg.startPct}%` }
                }
              >
                {slowest.label} {fmt(slowest.ms)}
              </span>
            </div>
          )}

          <div className="relative mt-0.5 h-6 border-t border-rule" aria-hidden>
            {ticks.map((t, i) => {
              const pct = (t.ms / span) * 100;
              const shift = i === 0 ? "0" : pct > 92 ? "-100%" : "-50%";
              return (
                <div key={t.ms} className="absolute top-0" style={{ left: `${pct}%` }}>
                  <div className="h-1.5 w-px bg-rule" />
                  <div
                    className="mt-0.5 text-[11px] leading-none tabular-nums text-muted"
                    style={{ transform: `translateX(${shift})` }}
                  >
                    {t.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <table className="mt-3 w-full text-xs">
        <caption className="sr-only">Time per phase of the call</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Duration</th>
            <th scope="col">Share of the call</th>
          </tr>
        </thead>
        <tbody>
          {timing.phases.map((p) => (
            <tr key={p.key}>
              <td className="py-0.5 pr-2">
                <span aria-hidden className={`mr-2 inline-block h-2 w-2 rounded-sm align-middle ${PHASE_BG[p.key]}`} />
                {p.label}
              </td>
              <td className="py-0.5 text-right font-medium tabular-nums">{fmt(p.ms)}</td>
              <td className="w-10 py-0.5 pl-2 text-right tabular-nums text-muted">
                {timing.totalMs > 0 ? `${Math.round((p.ms / timing.totalMs) * 100)}%` : "-"}
              </td>
            </tr>
          ))}
          <tr className="border-t border-rule">
            <td className="pr-2 pt-1 text-muted">Total at gateway</td>
            <td className="pt-1 text-right font-medium tabular-nums">{fmt(timing.totalMs)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <p className="mt-2 text-xs text-muted">
        {timing.connReused === true
          ? "Reused connection: no DNS, connect or TLS needed."
          : timing.connReused === false
            ? "New connection to the provider."
            : ""}
        {timing.ttfbMs !== null ? ` Time to first byte ${fmt(timing.ttfbMs)} (includes the setup phases).` : " No response byte was received."}
      </p>
    </section>
  );
}
