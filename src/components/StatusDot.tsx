export function StatusDot({ hasError, hasWarning }: { hasError: boolean; hasWarning: boolean }) {
  const color = hasError ? "bg-red-500" : hasWarning ? "bg-amber-500" : "bg-emerald-500";
  const label = hasError ? "error" : hasWarning ? "warning" : "ok";
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
    </span>
  );
}
