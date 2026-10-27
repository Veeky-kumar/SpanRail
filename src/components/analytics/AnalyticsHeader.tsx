import Link from "next/link";

export const RANGE_PRESETS = [7, 14, 30] as const;
export type AnalyticsTab = "overview" | "models" | "gateway";

const TABS: { key: AnalyticsTab; label: string; path: string; hint: string }[] = [
  { key: "overview", label: "Overview", path: "", hint: "Volume, failures, latency, cost" },
  { key: "models", label: "Models", path: "/models", hint: "Spend and speed by model" },
  { key: "gateway", label: "Gateway", path: "/gateway", hint: "Where a call spends its time" },
];

/** Reads the `?days=` preset, falling back to 14. Shared so every tab agrees on what an unknown value means. */
export function daysFrom(param: string | undefined): (typeof RANGE_PRESETS)[number] {
  const n = Number(param);
  return (RANGE_PRESETS as readonly number[]).includes(n) ? (n as (typeof RANGE_PRESETS)[number]) : 14;
}

/**
 * The top of every Analytics tab: the title, the tab strip and the date range. Both are plain links, so the range
 * survives a tab change and every view can be bookmarked or shared as a URL.
 */
export function AnalyticsHeader({
  projectId,
  days,
  active,
  extraQuery = "",
}: {
  projectId: string;
  days: number;
  active: AnalyticsTab;
  /** Extra query string kept on the range links, for example "&model=gpt-4o" (leading &). */
  extraQuery?: string;
}) {
  const base = `/projects/${projectId}/analytics`;
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Analytics</h2>
        <div role="group" aria-label="Date range" className="flex gap-0.5 rounded-data border border-rule bg-canvas p-0.5">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p}
              href={`${base}${TABS.find((t) => t.key === active)!.path}?days=${p}${extraQuery}`}
              aria-current={p === days ? "true" : undefined}
              className={`pressable rounded-[2px] px-3 py-1.5 text-xs tabular-nums transition-colors duration-150 ${
                p === days ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {p}d
            </Link>
          ))}
        </div>
      </div>
      <nav aria-label="Analytics views" className="mt-3 flex gap-1 border-b border-rule">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={`${base}${t.path}?days=${days}`}
              aria-current={on ? "page" : undefined}
              title={t.hint}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                on ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
