export function StatusDot({ hasError, hasWarning }: { hasError: boolean; hasWarning: boolean }) {
  // Shape carries the state as well as colour: filled = error, ring = warning, quiet dot = ok.
  const shape = hasError
    ? "bg-fault"
    : hasWarning
      ? "border border-fault bg-transparent"
      : "bg-muted/40";
  const label = hasError ? "error" : hasWarning ? "warning" : "ok";
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${shape}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
