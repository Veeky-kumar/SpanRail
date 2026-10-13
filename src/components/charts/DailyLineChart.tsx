"use client";

import { useState } from "react";
import type { DailyPoint } from "@/server/analytics";
import { formatShortDate, formatCompactCurrency, formatCompactNumber } from "@/lib/chartFormat";

const WIDTH = 600;
const HEIGHT = 200;
const PAD_LEFT = 44;
const PAD_BOTTOM = 20;
const PAD_TOP = 10;

// A function prop can't cross the server/client boundary (RSC), so the formatter is
// selected by name here rather than passed in from the server component.
const FORMATTERS = { currency: formatCompactCurrency, number: formatCompactNumber };

export function DailyLineChart({
  data,
  color = "var(--viz-orange)",
  valueType = "number",
}: {
  data: DailyPoint[];
  color?: string;
  valueType?: keyof typeof FORMATTERS;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const valueFormatter = FORMATTERS[valueType];

  const max = Math.max(1, ...data.map((d) => d.value));
  const plotWidth = WIDTH - PAD_LEFT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;

  const points = data.map((d, i) => ({
    x: PAD_LEFT + i * slot,
    y: PAD_TOP + plotHeight - (d.value / max) * plotHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? PAD_LEFT},${PAD_TOP + plotHeight} L${points[0]?.x ?? PAD_LEFT},${PAD_TOP + plotHeight} Z`;

  const yTicks = [0, max / 2, max];

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_LEFT) / slot);
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Daily cost">
        {yTicks.map((tick) => {
          const y = PAD_TOP + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
                {valueFormatter(tick)}
              </text>
            </g>
          );
        })}
        <line
          x1={PAD_LEFT}
          x2={WIDTH}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
          stroke="var(--viz-axis)"
          strokeWidth={1}
        />

        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hoverIndex !== null && (
          <>
            <line
              x1={points[hoverIndex].x}
              x2={points[hoverIndex].x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
            <circle cx={points[hoverIndex].x} cy={points[hoverIndex].y} r={5} fill={color} stroke="var(--viz-surface)" strokeWidth={2} />
          </>
        )}

        {data.map(
          (d, i) =>
            (i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
              <text key={d.date} x={points[i].x} y={HEIGHT - 4} textAnchor="middle" fontSize={9} fill="var(--viz-text-muted)">
                {formatShortDate(d.date)}
              </text>
            ),
        )}

        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${(points[hoverIndex].x / WIDTH) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-[var(--viz-text-secondary)]">{formatShortDate(data[hoverIndex].date)}</div>
          <div className="font-semibold" style={{ color: "var(--viz-text-primary)" }}>
            {valueFormatter(data[hoverIndex].value)}
          </div>
        </div>
      )}
    </div>
  );
}
