"use client";

import { useState } from "react";
import type { ModelUsage } from "@/server/analytics";
import { formatCompactNumber, formatCompactCurrency } from "@/lib/chartFormat";

const WIDTH = 600;
const ROW_HEIGHT = 32;
const LABEL_WIDTH = 140;
const PAD = 8;

export function TopModelsBarChart({ data }: { data: ModelUsage[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No generations with a model name yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.generationCount));
  const plotWidth = WIDTH - LABEL_WIDTH - PAD;
  const height = data.length * ROW_HEIGHT;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label="Top models by generation count">
        {data.map((d, i) => {
          const barWidth = (d.generationCount / max) * plotWidth;
          const y = i * ROW_HEIGHT;
          const barHeight = Math.min(20, ROW_HEIGHT - 10);
          const isHover = hoverIndex === i;
          return (
            <g key={d.model}>
              <text
                x={LABEL_WIDTH - 10}
                y={y + ROW_HEIGHT / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--viz-text-secondary)"
              >
                {d.model.length > 18 ? d.model.slice(0, 17) + "…" : d.model}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y + (ROW_HEIGHT - barHeight) / 2}
                width={Math.max(barWidth, 2)}
                height={barHeight}
                rx={4}
                fill="var(--viz-blue-450)"
                opacity={isHover ? 1 : 0.85}
              />
              <text
                x={LABEL_WIDTH + barWidth + 6}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={10}
                fill="var(--viz-text-muted)"
              >
                {formatCompactNumber(d.generationCount)}
              </text>
              <rect
                x={0}
                y={y}
                width={WIDTH}
                height={ROW_HEIGHT}
                fill="transparent"
                onPointerEnter={() => setHoverIndex(i)}
                onPointerLeave={() => setHoverIndex((h) => (h === i ? null : h))}
              />
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${(LABEL_WIDTH / WIDTH) * 100}%`,
            top: `${((hoverIndex * ROW_HEIGHT) / height) * 100}%`,
            transform: "translateY(-100%)",
          }}
        >
          <div className="text-[var(--viz-text-secondary)]">{data[hoverIndex].model}</div>
          <div className="font-semibold" style={{ color: "var(--viz-text-primary)" }}>
            {data[hoverIndex].generationCount.toLocaleString()} generations · {formatCompactCurrency(data[hoverIndex].totalCost)}
          </div>
        </div>
      )}
    </div>
  );
}
