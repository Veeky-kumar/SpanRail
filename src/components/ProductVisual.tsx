import { GatewayTiming } from "@/components/GatewayTiming";
import { SAMPLE_GATEWAY_METADATA, SAMPLE_MODEL } from "@/lib/sampleTrace";

/** A real time-budget ruler on sample data, framed like a detail panel. Used as the product visual. */
export function ProductVisual({ className = "" }: { className?: string }) {
  return (
    <figure className={`rounded-data border border-rule bg-surface text-ink shadow-[0_24px_48px_-24px_rgb(0_0_0/0.4)] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">Generation</div>
          <div className="truncate text-sm font-semibold">chat.completions</div>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted">{SAMPLE_MODEL}</span>
      </div>
      <div className="p-4">
        <GatewayTiming metadata={SAMPLE_GATEWAY_METADATA} />
      </div>
      <figcaption className="border-t border-border px-4 py-2 text-xs text-muted">Sample data</figcaption>
    </figure>
  );
}
