"use client";

import { useMemo, useState } from "react";
import type { SerializedTreeNode, SerializedObservation } from "@/server/serialize";
import { formatDuration } from "@/lib/format";
import { GatewayTiming } from "@/components/GatewayTiming";

function flatten(nodes: SerializedTreeNode[], expanded: Set<string>, out: SerializedTreeNode[] = []) {
  for (const n of nodes) {
    out.push(n);
    if (n.children.length > 0 && expanded.has(n.observation.id)) {
      flatten(n.children, expanded, out);
    }
  }
  return out;
}

function allIds(nodes: SerializedTreeNode[], out: string[] = []) {
  for (const n of nodes) {
    out.push(n.observation.id);
    allIds(n.children, out);
  }
  return out;
}

// The shape tells the kind of span at a glance: diamond = LLM generation, circle = event,
// square = any other span. The word is still available to screen readers and in the detail.
function TypeGlyph({ type }: { type: string }) {
  const shape = type === "GENERATION" ? "rotate-45 rounded-[1px] bg-accent" : type === "EVENT" ? "rounded-full border border-muted" : "rounded-[1px] border border-muted";
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" title={type.toLowerCase()}>
      <span aria-hidden className={`h-2 w-2 ${shape}`} />
      <span className="sr-only">{type.toLowerCase()}</span>
    </span>
  );
}

function levelEdge(level: string, selected: boolean) {
  if (level === "ERROR") return "border-l-fault";
  if (level === "WARNING") return "border-l-fault/50";
  return selected ? "border-l-accent" : "border-l-transparent";
}

export function TraceExplorer({ tree }: { tree: SerializedTreeNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allIds(tree)));
  const [selectedId, setSelectedId] = useState<string | null>(tree[0]?.observation.id ?? null);

  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);

  const { minStart, maxEnd } = useMemo(() => {
    const all = flatten(tree, new Set(allIds(tree)));
    let min = Infinity;
    let max = -Infinity;
    for (const r of all) {
      const s = r.observation.startTime;
      const e = r.observation.endTime ?? r.observation.startTime;
      if (s !== null) min = Math.min(min, s);
      if (e !== null) max = Math.max(max, e);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return { minStart: 0, maxEnd: 1 };
    }
    return { minStart: min, maxEnd: max };
  }, [tree]);

  const span = Math.max(maxEnd - minStart, 1);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = rows.find((r) => r.observation.id === selectedId)?.observation ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="self-start overflow-hidden rounded-[10px] border border-rule bg-surface">
        <div className="max-h-[70vh] overflow-y-auto" role="list" aria-label="Spans in this trace">
          {rows.map((row) => {
            const obs = row.observation;
            const hasChildren = row.children.length > 0;
            const isExpanded = expanded.has(obs.id);
            const isSelected = selectedId === obs.id;
            const duration =
              obs.startTime !== null && obs.endTime !== null ? obs.endTime - obs.startTime : null;
            const leftPct = obs.startTime !== null ? ((obs.startTime - minStart) / span) * 100 : 0;
            const widthPct = duration !== null ? Math.max((duration / span) * 100, 1) : 1;

            return (
              <div
                key={obs.id}
                role="listitem"
                className={`flex h-9 items-center border-b border-l-2 border-border transition-colors duration-100 last:border-b-0 ${levelEdge(
                  obs.level,
                  isSelected,
                )} ${isSelected ? "bg-canvas" : "hover:bg-canvas/60"}`}
                style={{ paddingLeft: `${row.depth * 14 + 6}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(obs.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${obs.name ?? "span"}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span aria-hidden className={`text-[10px] transition-transform duration-100 ${isExpanded ? "rotate-90" : ""}`}>
                      ▸
                    </span>
                  </button>
                ) : (
                  <span className="w-6 shrink-0" />
                )}

                <button
                  type="button"
                  onClick={() => setSelectedId(obs.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 pr-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <TypeGlyph type={obs.type} />
                  <span className="min-w-0 flex-1 truncate font-medium">{obs.name ?? "(unnamed)"}</span>
                  <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted sm:inline">
                    {formatDuration(duration)}
                  </span>
                  <span
                    aria-hidden
                    className="relative hidden h-2 w-28 shrink-0 rounded-[2px] bg-border md:block"
                    title="Position and length on the trace's shared time axis"
                  >
                    <span
                      className={`absolute inset-y-0 rounded-[2px] ${obs.level === "ERROR" ? "bg-fault" : "bg-t4"}`}
                      style={{ left: `${Math.min(leftPct, 99)}%`, width: `${Math.min(widthPct, 100 - Math.min(leftPct, 99))}%` }}
                    />
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[10px] border border-rule bg-surface">
        {selected ? (
          <div key={selected.id} className="reveal-fast">
            <ObservationDetail observation={selected} />
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">Select a span to see its timing, input and output.</p>
        )}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section className="border-t border-border px-5 py-4">
      <h4 className="text-sm font-semibold">{label}</h4>
      <pre className="mt-2 max-h-64 overflow-auto rounded bg-canvas p-3 text-xs">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ObservationDetail({ observation }: { observation: SerializedObservation }) {
  const duration =
    observation.startTime !== null && observation.endTime !== null
      ? observation.endTime - observation.startTime
      : null;
  const hasTiming = observation.metadata !== null && observation.metadata !== undefined;

  return (
    <div>
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{observation.type.charAt(0) + observation.type.slice(1).toLowerCase()}</span>
          {observation.level !== "DEFAULT" && (
            <span
              className={`rounded border px-1.5 py-0.5 text-xs font-medium ${
                observation.level === "ERROR" ? "border-fault/40 text-fault" : "border-rule text-ink"
              }`}
            >
              {observation.level === "ERROR" ? "Error" : "Warning"}
            </span>
          )}
        </div>
        <h3 className="mt-1 break-words text-lg font-semibold tracking-tight">{observation.name ?? "(unnamed)"}</h3>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Fact label="Duration">{formatDuration(duration)}</Fact>
          {observation.model && <Fact label="Model">{observation.model}</Fact>}
          {observation.totalCost !== null && <Fact label="Cost">${observation.totalCost.toFixed(5)}</Fact>}
          {observation.promptName && (
            <Fact label="Prompt">
              {observation.promptName}
              {observation.promptVersion !== null ? ` v${observation.promptVersion}` : ""}
            </Fact>
          )}
        </dl>

        {observation.statusMessage && (
          <p className="mt-3 break-words text-sm text-fault">{observation.statusMessage}</p>
        )}
      </header>

      {hasTiming && (
        <div className="border-t border-border px-5 py-4 empty:hidden">
          <GatewayTiming metadata={observation.metadata} />
        </div>
      )}

      <JsonBlock label="Input" value={observation.input} />
      <JsonBlock label="Output" value={observation.output} />
      <JsonBlock label="Metadata" value={observation.metadata} />
      <JsonBlock label="Usage" value={observation.usageDetails} />
      <JsonBlock label="Cost breakdown" value={observation.costDetails} />

      {observation.scores.length > 0 && (
        <section className="border-t border-border px-5 py-4">
          <h4 className="text-sm font-semibold">Scores</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {observation.scores.map((s) => (
              <span
                key={s.id}
                title={s.comment ?? undefined}
                className={`rounded border px-2 py-0.5 text-xs tabular-nums ${
                  s.source === "EVAL" ? "border-accent/40" : "border-rule"
                }`}
              >
                {s.name}: {s.value ?? s.stringValue ?? "-"}
                {s.source === "EVAL" && <span className="ml-1 text-accent">eval</span>}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
