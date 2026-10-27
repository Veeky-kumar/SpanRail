// Builds the weekday-by-hour grid for the "When calls arrive" chart. Days run Monday (index 0) to Sunday (6), hours 0-23 UTC.
export interface HeatRow {
  dow: number; // ISO weekday, 1 = Monday .. 7 = Sunday (what Postgres EXTRACT(ISODOW) returns)
  hour: number;
  count: number;
}

export function heatMatrix(rows: HeatRow[]): { cells: number[][]; max: number; total: number } {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let max = 0;
  let total = 0;
  for (const r of rows) {
    if (r.dow < 1 || r.dow > 7 || r.hour < 0 || r.hour > 23) continue;
    cells[r.dow - 1][r.hour] += r.count;
    total += r.count;
    max = Math.max(max, cells[r.dow - 1][r.hour]);
  }
  return { cells, max, total };
}
