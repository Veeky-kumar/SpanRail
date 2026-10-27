"use client";

import { useRef, useState } from "react";
import type { DailyPoint } from "@/server/analytics";
import { formatCompactNumber, formatShortDate } from "@/lib/chartFormat";

const WIDTH = 600;
const HEIGHT = 200;
const PAD_LEFT = 36;
const PAD_BOTTOM = 20;
const PAD_TOP = 10;

export function DailyBarChart({ data, color = "var(--viz-blue-450)" }: { data: DailyPoint[]; color?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.value));
  const plotWidth = WIDTH - PAD_LEFT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(24, slot * 0.6);

  const yTicks = [0, max / 2, max].map((v) => Math.round(v));

  return (
    <div ref={containerRef} className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Daily trace volume">
        {yTicks.map((tick) => {
          const y = PAD_TOP + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
                {formatCompactNumber(tick)}
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

        {data.map((d, i) => {
          const barHeight = (d.value / max) * plotHeight;
          const x = PAD_LEFT + i * slot + (slot - barWidth) / 2;
          const y = PAD_TOP + plotHeight - barHeight;
          const isHover = hoverIndex === i;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={4}
                fill={color}
                opacity={isHover ? 1 : 0.85}
              />
              {/* Hit target wider than the visible bar, full plot height, per interaction.md */}
              <rect
                x={PAD_LEFT + i * slot}
                y={PAD_TOP}
                width={slot}
                height={plotHeight}
                fill="transparent"
                onPointerEnter={() => setHoverIndex(i)}
                onPointerLeave={() => setHoverIndex((h) => (h === i ? null : h))}
              />
              {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
                <text
                  x={PAD_LEFT + i * slot + slot / 2}
                  y={HEIGHT - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--viz-text-muted)"
                >
                  {formatShortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute rounded-overlay border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${((hoverIndex + 0.5) / data.length) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-[var(--viz-text-secondary)]">{formatShortDate(data[hoverIndex].date)}</div>
          <div className="font-semibold" style={{ color: "var(--viz-text-primary)" }}>
            {data[hoverIndex].value.toLocaleString()} traces
          </div>
        </div>
      )}
    </div>
  );
}
