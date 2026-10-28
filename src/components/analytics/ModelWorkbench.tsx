"use client";

import { useMemo, useState } from "react";
import type { ModelDay, ModelRow } from "@/server/analytics";
import type { Insight } from "@/lib/insights";
import { formatCompactCurrency, formatCompactNumber, formatMs, formatPercent, formatShortDate } from "@/lib/chartFormat";
import { niceMax, pctChange } from "@/lib/series";
import { Kpi } from "./Kpi";

type SortKey = "model" | "generations" | "cost" | "per1k" | "p50Ms" | "p95Ms" | "errorRate";

const W = 640;
const H = 260;
const PL = 44;
const PR = 8;
const PT = 8;
const BOTTOM = 232;

const colorOf = (model: string, index: number) => (model === "Other" ? "var(--viz-other)" : `var(--viz-c${(index % 6) + 1})`);

/**
 * The Models tab: switch models on and off and every number, the stacked daily spend and the comparison table follow.
 * The "what changed" notes are about all models, so they stay put while you filter.
 */
export function ModelWorkbench({
  dates,
  models,
  daily,
  insights,
  days,
}: {
  dates: string[];
  models: ModelRow[];
  daily: ModelDay[];
  insights: Insight[];
  days: number;
}) {
  const [off, setOff] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "cost", dir: -1 });

  const active = useMemo(() => models.filter((m) => !off.includes(m.model)), [models, off]);
  const index = (m: string) => models.findIndex((x) => x.model === m);

  const byKey = useMemo(() => {
    const map = new Map<string, ModelDay>();
    for (const d of daily) map.set(`${d.model}|${d.date}`, d);
    return map;
  }, [daily]);
  const cell = (model: string, date: string) => byKey.get(`${model}|${date}`);

  const dayCost = dates.map((date) => active.reduce((a, m) => a + (cell(m.model, date)?.cost ?? 0), 0));
  const dayGens = dates.map((date) => active.reduce((a, m) => a + (cell(m.model, date)?.generations ?? 0), 0));
  const dayErrs = dates.map((date) => active.reduce((a, m) => a + (cell(m.model, date)?.errors ?? 0), 0));

  const gens = active.reduce((a, m) => a + m.generations, 0);
  const cost = active.reduce((a, m) => a + m.cost, 0);
  const prevCost = active.reduce((a, m) => a + m.prevCost, 0);
  const errs = active.reduce((a, m) => a + m.errors, 0);

  const max = niceMax(Math.max(0.0001, ...dayCost));
  const slot = (W - PL - PR) / dates.length;
  const barW = slot * 0.68;
  const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - PT);
  const labelEvery = Math.ceil(dates.length / 7);
  const sel = hover ?? dates.length - 1;

  const rows = useMemo(() => {
    const withDerived = active.map((m) => ({ ...m, per1k: m.generations > 0 ? (m.cost / m.generations) * 1000 : 0, errorRate: m.generations > 0 ? m.errors / m.generations : 0 }));
    return withDerived.sort((a, b) => {
      const k = sort.key;
      if (k === "model") return a.model.localeCompare(b.model) * sort.dir;
      const av = (a[k] ?? -1) as number;
      const bv = (b[k] ?? -1) as number;
      return (av - bv) * sort.dir;
    });
  }, [active, sort]);

  const toggle = (model: string) =>
    setOff((cur) => (cur.includes(model) ? cur.filter((m) => m !== model) : active.length > 1 ? [...cur, model] : cur));

  const heads: { key: SortKey; label: string; hint?: string; left?: boolean }[] = [
    { key: "model", label: "Model", left: true },
    { key: "generations", label: "Generations" },
    { key: "cost", label: "Cost" },
    { key: "per1k", label: "$ / 1k calls" },
    { key: "p50Ms", label: "p50", hint: "Typical generation time" },
    { key: "p95Ms", label: "p95", hint: "Slowest 1 in 20 generations" },
    { key: "errorRate", label: "Failed" },
  ];

  if (models.length === 0) {
    return (
      <p className="mt-8 rounded-data border border-dashed border-rule p-8 text-center text-sm text-muted">
        No generations with a model name in the last {days} days. Send a call with a model set, or route one through the gateway, and it appears here.
      </p>
    );
  }

  return (
    <div className="viz-root mt-5">
      <div role="group" aria-label="Models to include" className="flex flex-wrap gap-2">
        {models.map((m, i) => {
          const on = !off.includes(m.model);
          return (
            <button
              key={m.model}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m.model)}
              className={`pressable inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                on ? "border-rule bg-surface text-ink" : "border-border text-muted line-through opacity-70"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(m.model, i) }} />
              {m.model}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-data border border-rule bg-rule lg:grid-cols-4">
        <Kpi label="Generations" value={formatCompactNumber(gens)} change={null} note={`${active.length} of ${models.length} models`} trend={dayGens} />
        <Kpi label="Cost" value={formatCompactCurrency(cost)} change={pctChange(cost, prevCost)} lowerIsBetter trend={dayCost} />
        <Kpi label="Cost per 1k calls" value={formatCompactCurrency(gens > 0 ? (cost / gens) * 1000 : 0)} change={null} note="Across the models shown" trend={dayCost.map((c, i) => (dayGens[i] > 0 ? c / dayGens[i] : 0))} />
        <Kpi label="Failed generations" value={formatPercent(gens > 0 ? errs / gens : 0)} change={null} note={`${errs.toLocaleString()} of ${gens.toLocaleString()}`} lowerIsBetter trend={dayErrs.map((e, i) => (dayGens[i] > 0 ? e / dayGens[i] : 0))} tone={gens > 0 && errs / gens > 0.05 ? "critical" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-data border border-rule bg-surface p-4" aria-labelledby="stack-title">
          <h3 id="stack-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            Cost per day, by model
          </h3>
          <p className="mt-0.5 text-xs text-muted">Point at a day to read it on the right.</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Stacked daily cost by model" onPointerLeave={() => setHover(null)}>
            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
                <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--viz-text-muted)">
                  {formatCompactCurrency(t)}
                </text>
              </g>
            ))}
            {dates.map((date, i) => {
              let acc = 0;
              return (
                <g key={date} opacity={hover === null || hover === i ? 1 : 0.5}>
                  {active.map((m) => {
                    const v = cell(m.model, date)?.cost ?? 0;
                    const top = y(acc + v);
                    const height = Math.max(0, y(acc) - top);
                    acc += v;
                    return height > 0 ? (
                      <rect key={m.model} x={PL + i * slot + (slot - barW) / 2} y={top} width={barW} height={height} fill={colorOf(m.model, index(m.model))} stroke="var(--viz-surface)" strokeWidth={1} />
                    ) : null;
                  })}
                </g>
              );
            })}
            {dates.map((date, i) =>
              i % labelEvery === 0 || i === dates.length - 1 ? (
                <text key={date} x={PL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--viz-text-muted)">
                  {formatShortDate(date)}
                </text>
              ) : null,
            )}
            {dates.map((date, i) => (
              <rect key={`hit-${date}`} x={PL + i * slot} y={PT} width={slot} height={BOTTOM - PT} fill="transparent" onPointerEnter={() => setHover(i)} />
            ))}
          </svg>
        </section>

        <section className="rounded-data border border-rule bg-surface p-4" aria-live="polite">
          <h3 className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            {formatShortDate(dates[sel])}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{hover === null ? "Latest day" : "Spend by model"}</p>
          <ul className="mt-3 text-sm">
            {active.map((m) => (
              <li key={m.model} className="flex items-center justify-between gap-3 border-t border-border py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(m.model, index(m.model)) }} />
                  <span className="truncate">{m.model}</span>
                </span>
                <span className="tabular-nums">{formatCompactCurrency(cell(m.model, dates[sel])?.cost ?? 0)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t-2 border-ink pt-2 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatCompactCurrency(dayCost[sel])}</span>
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-data border border-rule bg-surface p-4" aria-labelledby="cmp-title">
          <h3 id="cmp-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            Model comparison
          </h3>
          <p className="mt-0.5 text-xs text-muted">Select a heading to sort. Speeds are how long the generation itself ran.</p>
          <p className="mt-1 text-xs text-muted sm:hidden">Swipe sideways for more columns.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-xs text-muted">
                  {heads.map((h) => (
                    <th key={h.key} scope="col" aria-sort={sort.key === h.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"} className={`p-0 font-medium ${h.left ? "text-left" : "text-right"}`}>
                      <button
                        type="button"
                        title={h.hint}
                        onClick={() => setSort((s) => ({ key: h.key, dir: s.key === h.key ? (s.dir === 1 ? -1 : 1) : h.key === "model" ? 1 : -1 }))}
                        className="w-full px-2 py-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        style={{ textAlign: h.left ? "left" : "right" }}
                      >
                        {h.label}
                        {sort.key === h.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.model} className="border-b border-border last:border-0">
                    <td className="px-2 py-2.5">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: colorOf(m.model, index(m.model)) }} />
                      {m.model}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{m.generations.toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCompactCurrency(m.cost)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCompactCurrency(m.per1k)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatMs(m.p50Ms)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatMs(m.p95Ms)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: m.errorRate > 0.05 ? "var(--viz-status-critical)" : undefined }}>
                      {formatPercent(m.errorRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-data border border-rule bg-surface p-4" aria-labelledby="chg-title">
          <h3 id="chg-title" className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
            What changed
          </h3>
          <p className="mt-0.5 text-xs text-muted">Against the {days} days before, across all models.</p>
          {insights.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing stands out yet. This fills in as more calls arrive.</p>
          ) : (
            <ul className="mt-2 text-sm leading-snug">
              {insights.map((i) => (
                <li key={i.head} className="border-t border-border py-3 first:border-0">
                  <span className="font-medium">{i.head}</span> <span className="text-muted">{i.body}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
