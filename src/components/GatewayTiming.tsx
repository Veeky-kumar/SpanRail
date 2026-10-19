import { parseGatewayTiming, type TimingPhaseKey } from "@/lib/gatewayTiming";

// One hue (the app's chart blue) at increasing strength, following the dataviz rule that
// magnitude uses a single sequential hue. Strength is fixed per phase so a phase keeps its
// look whichever other phases are present. Colour is never the only carrier: every segment is
// also listed in the table below with its value and share.
const STRENGTH: Record<TimingPhaseKey, number> = { dns: 0.3, connect: 0.45, tls: 0.6, wait: 0.8, transfer: 1 };

function fmt(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Network timing for a call that went through the Tracewell gateway. Renders nothing for
 * observations that carry no gateway timing, so existing traces are unaffected.
 */
export function GatewayTiming({ metadata }: { metadata: unknown }) {
  const timing = parseGatewayTiming(metadata);
  if (!timing) return null;

  const drawn = timing.phases.filter((p) => p.ms > 0);
  const sum = drawn.reduce((a, p) => a + p.ms, 0);
  const summary = timing.phases.map((p) => `${p.label} ${fmt(p.ms)}`).join(", ");

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Network timing</div>

      {sum > 0 && (
        <div
          role="img"
          aria-label={`Network timing, total ${fmt(timing.totalMs)}: ${summary}`}
          className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        >
          {drawn.map((p) => (
            <div
              key={p.key}
              title={`${p.label}: ${fmt(p.ms)}`}
              className="h-full min-w-[2px] rounded-sm"
              style={{ flexGrow: p.ms, flexBasis: 0, background: "var(--viz-blue-450)", opacity: STRENGTH[p.key] }}
            />
          ))}
        </div>
      )}

      <table className="mt-2 w-full text-xs">
        <tbody>
          {timing.phases.map((p) => (
            <tr key={p.key}>
              <td className="py-0.5 pr-2">
                <span
                  aria-hidden
                  className="mr-2 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{ background: "var(--viz-blue-450)", opacity: STRENGTH[p.key] }}
                />
                {p.label}
              </td>
              <td className="py-0.5 text-right font-medium tabular-nums">{fmt(p.ms)}</td>
              <td className="py-0.5 pl-2 text-right tabular-nums text-muted">
                {timing.totalMs > 0 ? `${Math.round((p.ms / timing.totalMs) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <td className="pt-1 pr-2 text-muted">Total at gateway</td>
            <td className="pt-1 text-right font-medium tabular-nums">{fmt(timing.totalMs)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <p className="mt-1.5 text-[11px] text-muted">
        {timing.connReused === true
          ? "Reused connection: no DNS, connect or TLS needed."
          : timing.connReused === false
            ? "New connection to the provider."
            : ""}
        {timing.ttfbMs !== null ? ` Time to first byte ${fmt(timing.ttfbMs)} (includes the setup phases).` : " No response byte was received."}
      </p>
    </div>
  );
}
