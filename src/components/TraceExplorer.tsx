"use client";

import { useMemo, useState } from "react";
import type { SerializedTreeNode, SerializedObservation } from "@/server/serialize";
import { formatDuration } from "@/lib/format";

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

function typeBadgeColor(type: string) {
  switch (type) {
    case "GENERATION":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "EVENT":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    default:
      return "bg-slate-500/15 text-slate-600 dark:text-slate-400";
  }
}

function levelColor(level: string) {
  if (level === "ERROR") return "border-l-red-500";
  if (level === "WARNING") return "border-l-amber-500";
  return "border-l-transparent";
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="max-h-[70vh] overflow-y-auto">
          {rows.map((row) => {
            const obs = row.observation;
            const hasChildren = row.children.length > 0;
            const isExpanded = expanded.has(obs.id);
            const duration =
              obs.startTime !== null && obs.endTime !== null ? obs.endTime - obs.startTime : null;
            const leftPct = obs.startTime !== null ? ((obs.startTime - minStart) / span) * 100 : 0;
            const widthPct = duration !== null ? Math.max((duration / span) * 100, 0.5) : 0.5;

            return (
              <button
                key={obs.id}
                onClick={() => setSelectedId(obs.id)}
                className={`flex w-full items-center gap-2 border-b border-l-2 border-border px-3 py-2 text-left text-sm transition-colors duration-100 last:border-b-0 hover:bg-canvas ${levelColor(
                  obs.level,
                )} ${selectedId === obs.id ? "bg-canvas" : ""}`}
                style={{ paddingLeft: `${row.depth * 16 + 12}px` }}
              >
                {hasChildren ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(obs.id);
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-muted"
                  >
                    {isExpanded ? "▾" : "▸"}
                  </span>
                ) : (
                  <span className="w-4 shrink-0" />
                )}

                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeBadgeColor(obs.type)}`}>
                  {obs.type.slice(0, 3)}
                </span>

                <span className="min-w-0 flex-1 truncate font-medium">{obs.name ?? "(unnamed)"}</span>

                <span className="hidden shrink-0 text-xs text-muted sm:inline">{formatDuration(duration)}</span>

                <span className="relative hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-canvas md:block">
                  <span
                    className="absolute inset-y-0 rounded-full bg-accent/70"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        {selected ? <ObservationDetail observation={selected} /> : <p className="text-sm text-muted">Select a span</p>}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-canvas p-3 text-xs">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ObservationDetail({ observation }: { observation: SerializedObservation }) {
  const duration =
    observation.startTime !== null && observation.endTime !== null
      ? observation.endTime - observation.startTime
      : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeBadgeColor(observation.type)}`}>
            {observation.type}
          </span>
          {observation.level !== "DEFAULT" && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                observation.level === "ERROR" ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"
              }`}
            >
              {observation.level}
            </span>
          )}
        </div>
        <h3 className="mt-1.5 text-base font-semibold">{observation.name ?? "(unnamed)"}</h3>
        <p className="text-xs text-muted">
          {formatDuration(duration)}
          {observation.model ? ` · ${observation.model}` : ""}
          {observation.totalCost !== null ? ` · $${observation.totalCost.toFixed(5)}` : ""}
        </p>
        {observation.statusMessage && (
          <p className="mt-1 break-words text-xs text-red-500">{observation.statusMessage}</p>
        )}
        {observation.promptName && (
          <p className="mt-1 text-xs text-muted">
            Prompt: <span className="font-medium text-ink">{observation.promptName}</span>
            {observation.promptVersion !== null ? ` v${observation.promptVersion}` : ""}
          </p>
        )}
      </div>

      <JsonBlock label="Input" value={observation.input} />
      <JsonBlock label="Output" value={observation.output} />
      <JsonBlock label="Metadata" value={observation.metadata} />
      <JsonBlock label="Usage" value={observation.usageDetails} />
      <JsonBlock label="Cost breakdown" value={observation.costDetails} />

      {observation.scores.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Scores</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {observation.scores.map((s) => (
              <span
                key={s.id}
                title={s.comment ?? undefined}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  s.source === "EVAL" ? "border-violet-500/30 bg-violet-500/10" : "border-border"
                }`}
              >
                {s.name}: {s.value ?? s.stringValue ?? "—"}
                {s.source === "EVAL" && <span className="ml-1 text-violet-500">· eval</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
