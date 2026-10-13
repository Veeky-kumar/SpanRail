// Threshold matches the dataviz skill's own worked example (marks-and-anatomy.md:
// "1,284 / 12.9K / $4.2M") — a 4-digit number stays a plain comma-grouped integer;
// only 10,000+ compacts to K.
export function formatCompactNumber(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString("en-US");
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

export function formatCompactCurrency(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "$" + n.toFixed(5);
  if (n < 1000) return "$" + n.toFixed(2);
  if (n < 1_000_000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

export function formatPercent(fraction: number): string {
  return (fraction * 100).toFixed(1) + "%";
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
