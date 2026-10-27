import { ProductVisual } from "@/components/ProductVisual";
import { SAMPLE_SPANS, SAMPLE_TRACE_MS } from "@/lib/sampleTrace";

// The same shapes the app's span list uses: a diamond for an LLM generation, a square for any other span.
function Glyph({ type }: { type: string }) {
  const shape = type === "generation" ? "rotate-45 rounded-[1px] bg-accent" : "rounded-[1px] border border-muted";
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      <span aria-hidden className={`h-2 w-2 ${shape}`} />
      <span className="sr-only">{type}</span>
    </span>
  );
}

/** A static trace on sample data: the span list on a shared time axis, and the selected generation's detail. */
export function TracePreview() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="overflow-hidden rounded-data border border-rule bg-surface">
        <div role="list" aria-label="Spans in a sample trace">
          {SAMPLE_SPANS.map((span) => {
            const selected = span.type === "generation";
            return (
              <div
                key={span.name}
                role="listitem"
                className={`flex h-9 items-center gap-2 border-b border-l-2 border-border pr-3 last:border-b-0 ${
                  selected ? "border-l-accent bg-canvas" : "border-l-transparent"
                }`}
                style={{ paddingLeft: `${span.depth * 14 + 12}px` }}
              >
                <Glyph type={span.type} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{span.name}</span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{span.dur} ms</span>
                <span aria-hidden className="relative hidden h-2 w-28 shrink-0 rounded-[2px] bg-border sm:block">
                  <span
                    className="absolute inset-y-0 rounded-[2px] bg-t4"
                    style={{
                      left: `${(span.start / SAMPLE_TRACE_MS) * 100}%`,
                      width: `${Math.max((span.dur / SAMPLE_TRACE_MS) * 100, 1.5)}%`,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">Sample data. Bars share one time axis: 0 to {SAMPLE_TRACE_MS} ms.</p>
      </div>
      <ProductVisual />
    </div>
  );
}
