export function StatTile({ label, value, tone }: { label: string; value: string; tone?: "critical" }) {
  return (
    <div className="viz-root rounded-xl border border-border bg-surface p-4">
      <div className="text-xs" style={{ color: "var(--viz-text-muted)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tracking-tight"
        style={{ color: tone === "critical" ? "var(--viz-status-critical)" : "var(--viz-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
