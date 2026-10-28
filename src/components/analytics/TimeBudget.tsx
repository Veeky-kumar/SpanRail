"use client";

import { useState } from "react";
import Link from "next/link";
import { LABELS, type TimingPhaseKey } from "@/lib/gatewayTiming";
import { PHASE_ORDER, type TimingSummary } from "@/lib/timingSummary";
import { niceTicks } from "@/lib/timeAxis";
import { layoutTreemap } from "@/lib/treemap";
import { formatCompactCurrency } from "@/lib/chartFormat";

// One hue, one fixed step per phase, the same tokens the trace view uses, so a colour means the same part of the round trip everywhere.
const FILL: Record<TimingPhaseKey, string> = {
  dns: "rgb(var(--t1))",
  connect: "rgb(var(--t2))",
  tls: "rgb(var(--t3))",
  wait: "rgb(var(--t4))",
  transfer: "rgb(var(--t5))",
};

const WHAT: Record<TimingPhaseKey, string> = {
  dns: "Looking up the provider's address.",
  connect: "Opening a connection to the provider.",
  tls: "Agreeing encryption keys.",
  wait: "The provider is working. Nothing has come back yet.",
  transfer: "The response is streaming back.",
};

const ms = (v: number) => (v < 10 ? `${v.toFixed(1)} ms` : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`);

export interface GatewayModel {
  model: string;
  calls: number;
  cost: number;
}

/** The Gateway tab: where an average call spends its time, how long calls take, and which models take them. */
export function TimeBudget({
  summary,
  models,
  selected,
  base,
}: {
  summary: TimingSummary;
  models: GatewayModel[];
  selected: string | null;
  /** The tab's path with its query up to the model, e.g. "/projects/p1/analytics/gateway?days=14". */
  base: string;
}) {
  const [phase, setPhase] = useState<TimingPhaseKey | null>(null);
  const [scrub, setScrub] = useState(40);
  const [bin, setBin] = useState<number | null>(null);

  const parts = PHASE_ORDER.map((k) => ({ key: k, ms: summary.meanMs[k] }));
  const span = Math.max(1, parts.reduce((a, p) => a + p.ms, 0));

  // Flow: one ribbon per phase from the single "one call" bar to its own node.
  // Each phase gets a slot at least MIN_SLOT tall on the right, so the labels of the tiny phases (DNS, connect, TLS)
  // never sit on top of each other; the ribbon still ends on a node of its true height, centred in that slot.
  const LEFT_H = 260;
  const GAP = 8;
  const MIN_SLOT = 34;
  const rightScale = (LEFT_H - GAP * (PHASE_ORDER.length - 1)) / span;
  let yl = 10;
  let yr = 10;
  const flow = parts.map((p) => {
    const hl = (p.ms / span) * LEFT_H;
    const hr = Math.max(p.ms * rightScale, 3);
    const slot = Math.max(hr, MIN_SLOT);
    const top = yr + (slot - hr) / 2;
    const d = `M16 ${yl} C360 ${yl},360 ${top},640 ${top} L640 ${top + hr} C360 ${top + hr},360 ${yl + hl},16 ${yl + hl} Z`;
    const node = { ...p, d, y: top, h: hr, mid: yr + slot / 2 };
    yl += hl;
    yr += slot + GAP;
    return node;
  });
  const flowHeight = Math.max(LEFT_H + 20, yr + 2);

  // Scrubber
  const at = (scrub / 100) * span;
  let cum = 0;
  let current = parts[0];
  for (const p of parts) {
    if (at >= cum && p.ms > 0) current = p;
    cum += p.ms;
  }
  const { ticks, unit } = niceTicks(span);
  const TL = 10;
  const TW = 880;
  let start = 0;
  const blocks = parts.map((p) => {
    const b = { ...p, x: TL + (start / span) * TW, w: (p.ms / span) * TW };
    start += p.ms;
    return b;
  });

  // Share of each group, for the headline
  const setup = parts[0].ms + parts[1].ms + parts[2].ms;
  const wait = parts[3].ms;
  const transfer = parts[4].ms;
  const biggest = [
    { share: wait / span, text: "of an average call is spent waiting for the provider's first byte" },
    { share: transfer / span, text: "of an average call is spent receiving the response" },
    { share: setup / span, text: "of an average call is spent setting up the connection" },
  ].sort((a, b) => b.share - a.share)[0];

  // Histogram
  const maxCount = Math.max(1, ...summary.bins.map((b) => b.count));
  const HW = 700;
  const HH = 190;
  const bw = (HW - 30) / summary.bins.length;
  const lastTo = summary.bins[summary.bins.length - 1].toMs;
  const xOf = (v: number) => 30 + Math.min(1, v / lastTo) * (HW - 30);
  const axis = [0, 1, 2, 3, 4].map((i) => Math.round((lastTo / 4) * i));

  // Treemap
  const byCost = models.some((m) => m.cost > 0);
  const tiles = layoutTreemap(models.map((m) => ({ key: m.model, value: byCost ? m.cost : m.calls })), 420, 250);
  const tileTotal = tiles.reduce((a, t) => a + t.value, 0);

  const model = (name: string) => models.find((m) => m.model === name)!;

  return (
    <div className="viz-root">
      <div role="group" aria-label="Model" className="flex flex-wrap gap-2">
        {[{ label: "All models", value: null as string | null }, ...models.map((m) => ({ label: m.model, value: m.model }))].map((t) => (
          <Link
            key={t.label}
            href={t.value ? `${base}&model=${encodeURIComponent(t.value)}` : base}
            aria-current={selected === t.value ? "true" : undefined}
            className={`pressable rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              selected === t.value ? "border-ink bg-ink text-surface" : "border-rule bg-surface text-ink hover:bg-canvas"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <div className="text-[56px] font-semibold leading-none tracking-[-0.04em] sm:text-[72px]">
          {Math.round(summary.meanTotalMs).toLocaleString()}
          <span className="ml-1 text-2xl tracking-tight text-muted">ms</span>
        </div>
        <p className="mt-3 max-w-2xl text-xl font-semibold leading-snug tracking-[-0.01em]">
          {Math.round(biggest.share * 100)}% {biggest.text}.
        </p>
        <p className="mt-1 text-sm text-muted">
          The average of {summary.calls.toLocaleString()} gateway calls{selected ? ` to ${selected}` : ""}. Half finish within {ms(summary.p50Ms)}; the slowest 1 in 20 take {ms(summary.p95Ms)} or more.
          {summary.reusedShare !== null && ` ${Math.round(summary.reusedShare * 100)}% of calls reused a connection, which skips DNS, connect and TLS.`}
        </p>
      </div>

      <section className="mt-6 rounded-data border border-rule bg-surface p-4" aria-labelledby="flow-title">
        <h3 id="flow-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
          Follow the time
        </h3>
        <p className="mt-0.5 text-xs text-muted">One average call, split by the phase it spent the time in. Point at a ribbon to read it.</p>
        <svg viewBox={`0 0 900 ${flowHeight}`} className="mt-3 w-full" role="img" aria-label={`An average call of ${ms(summary.meanTotalMs)} split into ${parts.map((p) => `${LABELS[p.key]} ${ms(p.ms)}`).join(", ")}`} onPointerLeave={() => setPhase(null)}>
          {flow.map((f) => (
            <path key={f.key} d={f.d} fill={FILL[f.key]} fillOpacity={phase === null || phase === f.key ? 0.92 : 0.25} onPointerEnter={() => setPhase(f.key)} />
          ))}
          <rect x={0} y={10} width={16} height={LEFT_H} rx={3} fill="rgb(var(--ink))" />
          {flow.map((f) => (
            <g key={`n-${f.key}`}>
              <rect x={640} y={f.y} width={14} height={f.h} rx={3} fill={FILL[f.key]} />
              <g className="max-sm:hidden">
                <text x={666} y={f.mid - 2} fontSize={13} fontWeight={600} fill="rgb(var(--ink))">{LABELS[f.key]}</text>
                <text x={666} y={f.mid + 13} fontSize={11} fill="rgb(var(--muted))">{ms(f.ms)} · {Math.round((f.ms / span) * 100)}%</text>
              </g>
            </g>
          ))}
        </svg>
        {/* The labels inside the drawing shrink to about 5 px on a phone, so the same numbers are listed here. */}
        <ul className="mt-3 space-y-1.5 text-sm sm:hidden">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: FILL[p.key] }} />
              <span className="font-medium">{LABELS[p.key]}</span>
              <span className="ml-auto tabular-nums text-muted">
                {ms(p.ms)} · {Math.round((p.ms / span) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-data border border-rule bg-surface p-4" aria-labelledby="scrub-title">
        <h3 id="scrub-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
          Scrub through a call
        </h3>
        <p className="mt-0.5 text-xs text-muted">Drag the handle along the average call. The ruler is in {unit === "s" ? "seconds" : "milliseconds"}.</p>
        <svg viewBox="0 0 900 84" className="mt-3 w-full" role="img" aria-label="The average call laid out in time">
          {blocks.map((b) => (
            <rect key={b.key} x={b.x} y={14} width={Math.max(b.w, 0)} height={30} fill={FILL[b.key]} stroke="rgb(var(--surface))" strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <g key={t.ms}>
              <line x1={TL + (t.ms / span) * TW} x2={TL + (t.ms / span) * TW} y1={46} y2={54} stroke="rgb(var(--muted))" />
              <text x={TL + (t.ms / span) * TW} y={70} textAnchor="middle" fontSize={10} fill="rgb(var(--muted))">{t.label}</text>
            </g>
          ))}
          <line x1={TL + (scrub / 100) * TW} x2={TL + (scrub / 100) * TW} y1={6} y2={50} stroke="rgb(var(--ink))" strokeWidth={2.5} />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={scrub}
          onChange={(e) => setScrub(Number(e.target.value))}
          aria-label="Time into the call"
          aria-valuetext={`${Math.round(at)} milliseconds, ${LABELS[current.key]}`}
          className="mt-2 h-8 w-full accent-accent"
        />
        <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{Math.round(at).toLocaleString()} ms</span>
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: FILL[current.key] }} />
            {LABELS[current.key]}
          </span>
          <span className="text-sm text-muted">{WHAT[current.key]}</span>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="min-w-0 rounded-data border border-rule bg-surface p-4" aria-labelledby="hist-title">
          <h3 id="hist-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            How long calls take
          </h3>
          <p className="mt-0.5 text-xs text-muted">Calls by total duration. The axis ends at the 99th percentile; longer calls are counted in the last bar.</p>
          <svg viewBox={`0 0 ${HW} ${HH + 36}`} className="mt-3 w-full" role="img" aria-label={`Histogram of call duration. Median ${ms(summary.p50Ms)}, 95th percentile ${ms(summary.p95Ms)}`} onPointerLeave={() => setBin(null)}>
            {summary.bins.map((b, i) => {
              const h = (b.count / maxCount) * (HH - 8);
              const slow = b.fromMs >= summary.p95Ms;
              return (
                <g key={i}>
                  <rect x={30 + i * bw + 1} y={HH - h} width={bw - 2} height={Math.max(h, b.count > 0 ? 1.5 : 0)} rx={2} fill={slow ? "var(--viz-orange)" : "var(--viz-blue-450)"} opacity={bin === null || bin === i ? 1 : 0.55} />
                  <rect x={30 + i * bw} y={0} width={bw} height={HH} fill="transparent" onPointerEnter={() => setBin(i)} />
                </g>
              );
            })}
            <line x1={30} x2={HW} y1={HH} y2={HH} stroke="var(--viz-axis)" />
            <line x1={xOf(summary.p50Ms)} x2={xOf(summary.p50Ms)} y1={2} y2={HH} stroke="rgb(var(--ink))" strokeWidth={1.5} strokeDasharray="4 3" />
            <line x1={xOf(summary.p95Ms)} x2={xOf(summary.p95Ms)} y1={2} y2={HH} stroke="var(--viz-orange)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={xOf(summary.p50Ms)} y={HH + 16} textAnchor="middle" fontSize={10} fontWeight={600} fill="rgb(var(--ink))">p50</text>
            <text x={xOf(summary.p95Ms)} y={HH + 16} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--viz-orange)">p95</text>
            {axis.map((v, i) => (
              <text key={v} x={xOf(v)} y={HH + 31} textAnchor={i === 0 ? "start" : i === axis.length - 1 ? "end" : "middle"} fontSize={9} fill="var(--viz-text-muted)">
                {v === 0 ? "0" : ms(v)}
                {i === axis.length - 1 ? " +" : ""}
              </text>
            ))}
          </svg>
          <p className="mt-1 min-h-[1.25rem] text-xs tabular-nums text-muted" aria-live="polite">
            {bin === null
              ? "Point at a bar to read it."
              : `${ms(summary.bins[bin].fromMs)} to ${ms(summary.bins[bin].toMs)}${bin === summary.bins.length - 1 ? " and over" : ""}: ${summary.bins[bin].count.toLocaleString()} calls (${((summary.bins[bin].count / summary.calls) * 100).toFixed(1)}%)`}
          </p>
        </section>

        <section className="min-w-0 rounded-data border border-rule bg-surface p-4" aria-labelledby="tree-title">
          <h3 id="tree-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            {byCost ? "Who gets the bill" : "Where the calls go"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">Gateway calls in this period, one tile per model. Select a tile to look at that model alone.</p>
          <svg viewBox="0 0 420 250" className="mt-3 w-full" role="group" aria-label="Models by share">
            {tiles.map((t) => {
              const share = tileTotal > 0 ? Math.round((t.value / tileTotal) * 100) : 0;
              const m = model(t.key);
              const on = selected === null || selected === t.key;
              // One hue, deeper for a bigger share: the tile's size and its name carry the meaning, not a colour that
              // would have to match the Models tab.
              const depth = 0.35 + 0.65 * (tileTotal > 0 ? t.value / tiles[0].value : 0);
              return (
                <Link key={t.key} href={`${base}&model=${encodeURIComponent(t.key)}`} aria-label={`${t.key}: ${share}% of ${byCost ? "spend" : "calls"}`}>
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={4} fill="var(--viz-blue-450)" fillOpacity={on ? depth : 0.15} stroke="var(--viz-surface)" strokeWidth={3} />
                  {t.w > 80 && t.h > 40 && (
                    <>
                      {/* A surface-coloured label chip, so the text keeps its contrast on every tile colour and in both themes. */}
                      <rect x={t.x + 6} y={t.y + 6} width={Math.min(t.w - 12, 112)} height={34} rx={3} fill="rgb(var(--surface))" fillOpacity={0.94} />
                      <text x={t.x + 12} y={t.y + 21} fontSize={11} fontWeight={600} fill="rgb(var(--ink))">{t.key.length > 14 ? t.key.slice(0, 13) + "…" : t.key}</text>
                      <text x={t.x + 12} y={t.y + 34} fontSize={10} fill="rgb(var(--muted))">{byCost ? formatCompactCurrency(m.cost) : m.calls.toLocaleString()} · {share}%</text>
                    </>
                  )}
                </Link>
              );
            })}
          </svg>
        </section>
      </div>
    </div>
  );
}
