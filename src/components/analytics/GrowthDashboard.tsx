"use client";

import { useState } from "react";
import type { FunnelStep, FunnelStepId } from "@/lib/growth";

export interface GrowthRecent {
  id: string;
  email: string;
  name: string | null;
  when: string;
  source: string;
  country: string | null;
  reached: FunnelStepId;
}

export interface GrowthProps {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  daily: { day: string; count: number }[];
  funnelAll: FunnelStep[];
  funnel30d: FunnelStep[];
  sources: { label: string; count: number }[];
  countries: { label: string; count: number }[];
  recent: GrowthRecent[];
}

const REACHED: Record<FunnelStepId, string> = {
  "signed-up": "Signed up",
  project: "Created a project",
  "api-key": "Created an API key",
  "first-trace": "Sent a trace",
  "gateway-call": "Sent a gateway call",
};
const ORDER: FunnelStepId[] = ["signed-up", "project", "api-key", "first-trace", "gateway-call"];

const shortDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The growth page: who signed up, where from, and how far they got. Every number is passed in; nothing is fetched here. */
export function GrowthDashboard(p: GrowthProps) {
  const [period, setPeriod] = useState<"all" | "30d">("all");
  const [day, setDay] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const funnel = period === "all" ? p.funnelAll : p.funnel30d;
  const base = funnel[0]?.count ?? 0;
  const gateway = funnel[4]?.count ?? 0;
  const peak = Math.max(1, ...p.daily.map((d) => d.count));
  const sourceMax = Math.max(1, ...p.sources.map((s) => s.count));
  const countryMax = Math.max(1, ...p.countries.map((s) => s.count));
  const recent = source ? p.recent.filter((r) => r.source === source) : p.recent;

  // The step where the most people stop, for the sentence above the funnel.
  let worst = { i: 0, lost: -1 };
  for (let i = 0; i < funnel.length - 1; i++) {
    const lost = funnel[i].count - funnel[i + 1].count;
    if (lost > worst.lost) worst = { i, lost };
  }

  const dayRead =
    day === null
      ? `${p.signups30d.toLocaleString()} signups in 30 days, ${p.signups7d.toLocaleString()} in the last 7.`
      : `${shortDay(p.daily[day].day)}: ${p.daily[day].count} signup${p.daily[day].count === 1 ? "" : "s"}.`;

  const headline =
    base === 0
      ? "Nobody has signed up yet."
      : `${gateway.toLocaleString()} of ${base.toLocaleString()} ${period === "all" ? "accounts" : "recent signups"} ${gateway === 1 ? "has" : "have"} sent a call through the gateway.`;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Growth</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Who signed up, where they came from, and how far they got. Counted from your own database. Page views and visitors are in Umami, if you have set it up.
      </p>

      <p className="mt-6 max-w-3xl text-xl font-semibold leading-snug tracking-[-0.01em]">{headline}</p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-data border border-rule bg-rule lg:grid-cols-4">
        {[
          ["Accounts", p.totalUsers.toLocaleString(), "since the start"],
          ["Last 7 days", p.signups7d.toLocaleString(), "new accounts"],
          ["Last 30 days", p.signups30d.toLocaleString(), "new accounts"],
          ["Reached the gateway", base > 0 ? `${Math.round((gateway / base) * 100)}%` : "—", period === "all" ? "of all accounts" : "of the last 30 days"],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-surface p-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{value}</dd>
            <dd className="mt-0.5 text-xs text-muted">{note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col rounded-data border border-rule bg-surface p-4" aria-labelledby="daily-title">
          <h2 id="daily-title" className="text-sm font-medium">Signups per day</h2>
          <p className="mt-0.5 min-h-[1rem] text-xs text-muted" aria-live="polite">{dayRead}</p>
          <div className="mt-4 flex min-h-36 flex-1 items-end gap-[3px]" role="group" aria-label={`Signups per day over the last 30 days, peak ${peak}`} onPointerLeave={() => setDay(null)}>
            {p.daily.map((d, i) => (
              <button
                key={d.day}
                type="button"
                aria-label={`${shortDay(d.day)}: ${d.count} signups`}
                onPointerEnter={() => setDay(i)}
                onFocus={() => setDay(i)}
                onBlur={() => setDay(null)}
                className="group flex h-full flex-1 items-end focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span
                  className={`block w-full rounded-t-[2px] transition-opacity duration-150 ${d.count > 0 ? "bg-accent" : "bg-rule"} ${day !== null && day !== i ? "opacity-50" : ""}`}
                  style={{ height: `${d.count > 0 ? Math.max(6, (d.count / peak) * 100) : 3}%` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{shortDay(p.daily[0]?.day ?? "")}</span>
            <span>{shortDay(p.daily[p.daily.length - 1]?.day ?? "")}</span>
          </div>
        </section>

        <section className="rounded-data border border-rule bg-surface p-4" aria-labelledby="funnel-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="funnel-title" className="text-sm font-medium">How far people get</h2>
              <p className="mt-0.5 text-xs text-muted">
                {worst.lost > 0 ? `Most people stop after “${funnel[worst.i].label.toLowerCase()}”: ${worst.lost.toLocaleString()} did not go on.` : "Nobody has dropped off yet."}
              </p>
            </div>
            <div role="group" aria-label="Funnel period" className="flex shrink-0 gap-0.5 rounded-data border border-rule bg-canvas p-0.5">
              {([["all", "All time"], ["30d", "30 days"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={period === k}
                  onClick={() => setPeriod(k)}
                  className={`pressable rounded-[2px] px-2.5 py-1 text-xs transition-colors duration-150 ${period === k ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ol className="mt-4 space-y-3">
            {funnel.map((s, i) => (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{s.label}</span>
                  <span className="tabular-nums text-muted">
                    <span className="font-medium text-ink">{s.count.toLocaleString()}</span>
                    {s.pctOfSignups !== null ? ` · ${s.pctOfSignups}%` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-2 bg-rule/60" role="img" aria-label={`${s.label}: ${s.count}`}>
                  <div className="h-2 bg-accent transition-[width] duration-300" style={{ width: `${s.pctOfSignups ?? 0}%` }} />
                </div>
                {i > 0 && s.pctOfPrevious !== null && (
                  <div className="mt-1 text-xs tabular-nums text-muted">
                    {s.pctOfPrevious}% of the step before
                    {/* The steps are not strictly nested (a trace can arrive without a key made here), so a later step can be larger. */}
                    {funnel[i - 1].count > s.count ? ` · ${(funnel[i - 1].count - s.count).toLocaleString()} stopped` : ""}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-data border border-rule bg-surface p-4" aria-labelledby="src-title">
          <h2 id="src-title" className="text-sm font-medium">Where they came from</h2>
          <p className="mt-0.5 text-xs text-muted">UTM source first, then the referring site, otherwise direct. Select one to filter the recent signups below.</p>
          {p.sources.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No signups yet.</p>
          ) : (
            <ul className="mt-3">
              {p.sources.map((s) => {
                const on = source === s.label;
                return (
                  <li key={s.label}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSource(on ? null : s.label)}
                      className={`grid min-h-10 w-full grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-data px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-canvas" : ""}`}
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="h-2 bg-rule/60"><span className="block h-2 bg-accent" style={{ width: `${(s.count / sourceMax) * 100}%` }} /></span>
                      <span className="text-right tabular-nums">{s.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-data border border-rule bg-surface p-4" aria-labelledby="cty-title">
          <h2 id="cty-title" className="text-sm font-medium">Where in the world</h2>
          <p className="mt-0.5 text-xs text-muted">A two-letter country from a header your host&apos;s edge network adds. No IP address is stored.</p>
          {p.countries.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No country recorded. It comes from a header your host&apos;s edge network adds, and may be absent.</p>
          ) : (
            <ul className="mt-3">
              {p.countries.map((c) => (
                <li key={c.label} className="grid min-h-10 grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3 px-2 py-1.5 text-sm">
                  <span>{c.label}</span>
                  <span className="h-2 bg-rule/60"><span className="block h-2 bg-t4" style={{ width: `${(c.count / countryMax) * 100}%` }} /></span>
                  <span className="text-right tabular-nums">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-data border border-rule bg-surface p-4" aria-labelledby="recent-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recent-title" className="text-sm font-medium">Recent signups</h2>
          {source && (
            <button type="button" onClick={() => setSource(null)} className="text-xs text-muted underline underline-offset-4 hover:text-ink">
              Showing only {source}. Show everyone
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">The latest {p.recent.length} accounts. Dots show how far each got: project, API key, trace, gateway call.</p>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{source ? `Nobody in the latest accounts came from ${source}.` : "Nobody has signed up yet."}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 pr-4 font-normal">Account</th>
                  <th className="pb-2 pr-4 font-normal">When</th>
                  <th className="pb-2 pr-4 font-normal">Source</th>
                  <th className="pb-2 pr-4 font-normal">Country</th>
                  <th className="pb-2 font-normal">Got as far as</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const step = ORDER.indexOf(r.reached);
                  return (
                    <tr key={r.id} className="border-t border-rule align-top">
                      <td className="max-w-[14rem] truncate py-2 pr-4" title={r.email}>
                        {r.email}
                        {r.name ? <span className="block text-xs text-muted">{r.name}</span> : null}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 text-muted">{r.when}</td>
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4">{r.country ?? "—"}</td>
                      <td className="py-2">
                        <span className="mr-2 inline-flex gap-1 align-middle" aria-hidden="true">
                          {[1, 2, 3, 4].map((k) => (
                            <span key={k} className={`h-2.5 w-2.5 rounded-full ${step >= k ? "bg-accent" : "bg-rule"}`} />
                          ))}
                        </span>
                        {REACHED[r.reached]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
