// Small pure helpers shared by the analytics charts, kept out of the components so the rules are unit-tested.

/** Relative change from `prev` to `cur`, as a fraction (0.1 = +10%). Null when there is nothing to compare to. */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / prev;
}

/** An SVG path through the points as straight segments: "M x y L x y ...". Empty for no points. */
export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** A path for a small trend line that fills `w` by `h`. A flat series draws a flat line in the middle. */
export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return "";
  if (values.length === 1) return linePath([[0, h / 2], [w, h / 2]]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return linePath(
    values.map((v, i): [number, number] => [
      (i * w) / (values.length - 1),
      span === 0 ? h / 2 : h - pad - ((v - min) / span) * (h - 2 * pad),
    ]),
  );
}

/** The next "round" number at or above `v` (1, 2, 2.5, 5 times a power of ten), for an axis maximum. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}
