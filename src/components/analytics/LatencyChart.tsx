"use client";

import { useState } from "react";
import { formatMs, formatShortDate } from "@/lib/chartFormat";
import { niceMax } from "@/lib/series";

export interface LatencyPoint {
  date: string;
  p50Ms: number | null;
  p95Ms: number | null;
}

const W = 600;
const H = 210;
const PL = 44;
const PR = 8;
const PT = 10;
const PB = 22;

// A day with no traces has no latency. The line stops there instead of dropping to zero, which would read as "fast".
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

/** The typical (p50) and slow (p95) trace duration for each day. */
export function LatencyChart({ data }: { data: LatencyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const max = niceMax(Math.max(100, ...data.map((d) => d.p95Ms ?? 0)));
  const slot = (W - PL - PR) / n;
  const cx = (i: number) => PL + (i + 0.5) * slot;
  const y = (v: number) => H - PB - (v / max) * (H - PB - PT);
  const labelEvery = Math.ceil(n / 6);
  const any = data.some((d) => d.p50Ms !== null);

  if (!any) return <p className="py-10 text-center text-sm text-muted">No traces in this period yet.</p>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Median and 95th percentile trace duration per day" onPointerLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
              {formatMs(t)}
            </text>
          </g>
        ))}
        <path d={segments(data.map((d) => d.p95Ms), cx, y)} fill="none" stroke="var(--viz-orange)" strokeWidth={2} strokeLinejoin="round" />
        <path d={segments(data.map((d) => d.p50Ms), cx, y)} fill="none" stroke="var(--viz-blue-450)" strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d.date} x={cx(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--viz-text-muted)">
              {formatShortDate(d.date)}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <line x1={cx(hover)} x2={cx(hover)} y1={PT} y2={H - PB} stroke="var(--viz-text-muted)" strokeOpacity={0.5} pointerEvents="none" />
        )}
        {data.map((d, i) => (
          <rect key={d.date} x={PL + i * slot} y={PT} width={slot} height={H - PB - PT} fill="transparent" onPointerEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--viz-blue-450)" }} />p50, the typical trace</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--viz-orange)" }} />p95, the slowest 1 in 20</span>
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute rounded-overlay border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(cx(hover) / W) * 100}%`, top: 0, transform: "translate(-50%, -100%)" }}
        >
          <div className="text-[var(--viz-text-secondary)]">{formatShortDate(data[hover].date)}</div>
          <div className="tabular-nums" style={{ color: "var(--viz-text-primary)" }}>p50 {formatMs(data[hover].p50Ms)}</div>
          <div className="tabular-nums" style={{ color: "var(--viz-text-primary)" }}>p95 {formatMs(data[hover].p95Ms)}</div>
        </div>
      )}
    </div>
  );
}
