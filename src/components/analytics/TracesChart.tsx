"use client";

import { useState } from "react";
import { formatCompactNumber, formatShortDate } from "@/lib/chartFormat";
import { linePath, niceMax } from "@/lib/series";

export interface TracePoint {
  date: string;
  traces: number;
  errorTraces: number;
}

const W = 640;
const H = 250;
const PL = 40;
const PR = 8;
const PT = 10;
const MAIN_BOTTOM = 172;
const ERR_BOTTOM = 226;
const ERR_MAX_H = 36;

/** Traces per day as a line over a soft area, with the days' failed traces as small bars underneath. */
export function TracesChart({ data }: { data: TracePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const max = niceMax(Math.max(1, ...data.map((d) => d.traces)));
  const errMax = Math.max(1, ...data.map((d) => d.errorTraces));
  const slot = (W - PL - PR) / n;
  const cx = (i: number) => PL + (i + 0.5) * slot;
  const y = (v: number) => MAIN_BOTTOM - (v / max) * (MAIN_BOTTOM - PT);
  const pts = data.map((d, i): [number, number] => [cx(i), y(d.traces)]);
  const line = linePath(pts);
  const area = n > 0 ? `${line} L${cx(n - 1).toFixed(1)} ${MAIN_BOTTOM} L${cx(0).toFixed(1)} ${MAIN_BOTTOM} Z` : "";
  const barW = Math.max(2, Math.min(14, slot * 0.6));
  const labelEvery = Math.ceil(n / 6);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Traces per day, with failed traces underneath" onPointerLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
              {formatCompactNumber(Math.round(t))}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--viz-blue-450)" fillOpacity={0.14} />
        <path d={line} fill="none" stroke="var(--viz-blue-450)" strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => {
          const h = d.errorTraces > 0 ? Math.max(2, (d.errorTraces / errMax) * ERR_MAX_H) : 0;
          return <rect key={d.date} x={cx(i) - barW / 2} y={ERR_BOTTOM - h} width={barW} height={h} rx={1.5} fill="var(--viz-status-critical)" opacity={hover === null || hover === i ? 1 : 0.5} />;
        })}
        <line x1={PL} x2={W - PR} y1={ERR_BOTTOM} y2={ERR_BOTTOM} stroke="var(--viz-axis)" />
        <text x={PL - 6} y={ERR_BOTTOM - 2} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
          failed
        </text>
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d.date} x={cx(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--viz-text-muted)">
              {formatShortDate(d.date)}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={cx(hover)} x2={cx(hover)} y1={PT} y2={ERR_BOTTOM} stroke="var(--viz-text-muted)" strokeOpacity={0.5} />
            <circle cx={cx(hover)} cy={y(data[hover].traces)} r={4} fill="var(--viz-blue-450)" stroke="var(--viz-surface)" strokeWidth={2} />
          </g>
        )}
        {data.map((d, i) => (
          <rect key={`hit-${d.date}`} x={PL + i * slot} y={PT} width={slot} height={ERR_BOTTOM - PT} fill="transparent" onPointerEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute rounded-overlay border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(cx(hover) / W) * 100}%`, top: 0, transform: "translate(-50%, -100%)" }}
        >
          <div className="text-[var(--viz-text-secondary)]">{formatShortDate(data[hover].date)}</div>
          <div className="font-semibold tabular-nums" style={{ color: "var(--viz-text-primary)" }}>
            {data[hover].traces.toLocaleString()} traces
          </div>
          <div className="tabular-nums" style={{ color: "var(--viz-status-critical)" }}>
            {data[hover].errorTraces.toLocaleString()} failed
          </div>
        </div>
      )}
    </div>
  );
}
