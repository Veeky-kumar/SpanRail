import { sparkPath } from "@/lib/series";

/**
 * A headline number with its change against the period before and a small trend line. The change is written out
 * with a sign and an arrow, and whether it is good or bad is also carried by colour, never by colour alone.
 */
export function Kpi({
  label,
  value,
  change,
  lowerIsBetter = false,
  trend,
  tone,
  note,
}: {
  label: string;
  value: string;
  /** Fraction against the previous period (0.1 = +10%); null when there is nothing to compare to. */
  change: number | null;
  lowerIsBetter?: boolean;
  trend: number[];
  tone?: "critical";
  /** Replaces the change line, for figures with no earlier period to compare to. */
  note?: string;
}) {
  const flat = change === null || Math.abs(change) < 0.005;
  const good = change !== null && (lowerIsBetter ? change < 0 : change > 0);
  const color = note !== undefined || flat ? "var(--viz-text-muted)" : good ? "var(--viz-success)" : "var(--viz-status-critical)";
  const text =
    note !== undefined
      ? note
      : change === null
      ? "No earlier period"
      : flat
        ? "No change vs earlier"
        : `${change > 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(1)}% vs earlier`;

  return (
    <div className="viz-root bg-surface p-4">
      <div className="text-xs" style={{ color: "var(--viz-text-muted)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums"
        style={{ color: tone === "critical" ? "var(--viz-status-critical)" : "var(--viz-text-primary)" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs tabular-nums" style={{ color }}>
        {text}
      </div>
      <svg viewBox="0 0 160 30" preserveAspectRatio="none" className="mt-2 h-7 w-full" aria-hidden="true">
        <path d={sparkPath(trend, 160, 30)} fill="none" stroke="var(--viz-blue-450)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
