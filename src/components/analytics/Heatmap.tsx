import { heatMatrix, type HeatRow } from "@/lib/heatmap";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CELL_W = 28;
const CELL_H = 22;
const LEFT = 34;
const TOP = 4;

/** Traces by weekday and hour (UTC). A darker cell is a busier hour; every cell also carries its exact count. */
export function Heatmap({ rows }: { rows: HeatRow[] }) {
  const { cells, max, total } = heatMatrix(rows);
  if (total === 0) return <p className="py-10 text-center text-sm text-muted">No traces in this period yet.</p>;
  const width = LEFT + 24 * CELL_W;
  const height = TOP + 7 * CELL_H + 20;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Traces by weekday and hour, ${total.toLocaleString()} in total`}>
        {cells.map((row, d) =>
          row.map((count, h) => (
            <rect
              key={`${d}-${h}`}
              x={LEFT + h * CELL_W + 1}
              y={TOP + d * CELL_H + 1}
              width={CELL_W - 2}
              height={CELL_H - 2}
              rx={2}
              fill={count === 0 ? "var(--viz-grid)" : "var(--viz-blue-450)"}
              fillOpacity={count === 0 ? 0.5 : 0.15 + 0.85 * (count / max)}
            >
              <title>{`${DAYS[d]} ${String(h).padStart(2, "0")}:00 UTC: ${count.toLocaleString()} trace${count === 1 ? "" : "s"}`}</title>
            </rect>
          )),
        )}
        {DAYS.map((d, i) => (
          <text key={d} x={0} y={TOP + i * CELL_H + CELL_H / 2 + 3} fontSize={10} fill="var(--viz-text-muted)">
            {d}
          </text>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} x={LEFT + h * CELL_W + CELL_W / 2} y={height - 5} textAnchor="middle" fontSize={10} fill="var(--viz-text-muted)">
            {String(h).padStart(2, "0")}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted">Hours are UTC. The busiest hour had {max.toLocaleString()} traces.</p>
    </div>
  );
}
