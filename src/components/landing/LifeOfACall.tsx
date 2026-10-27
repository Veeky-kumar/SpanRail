"use client";

import { useEffect, useState } from "react";
import { PHASE_BG } from "@/components/GatewayTiming";
import { JourneyContext } from "@/components/landing/journeyContext";
import { STAGES, journeyState, nextStep, normalizeStep, prevStep } from "@/lib/callJourney";
import { niceTicks, phaseLayout } from "@/lib/timeAxis";

function fmt(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

/**
 * Interactive walk through one call. The isometric figure (an Anatomy-style "time rail") is passed
 * in as `figure`, built on the server; it moves with the step and connection chosen here.
 */
export function LifeOfACall({ figure }: { figure: React.ReactNode }) {
  const [step, setStep] = useState(0);
  const [reused, setReused] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      const next = nextStep(step, reused);
      if (next === step) setPlaying(false);
      else setStep(next);
    }, 1800);
    return () => window.clearTimeout(id);
  }, [playing, step, reused]);

  const state = journeyState(step, reused);
  const stage = STAGES[step];
  const layout = phaseLayout(state.phases.map((p) => ({ key: p.key, label: p.label, ms: p.ms })), state.totalMs);
  const { ticks, unit } = niceTicks(state.totalMs);
  const elapsed = state.phases.filter((p) => p.status !== "upcoming").reduce((a, p) => a + p.ms, 0);
  const activePhase = state.phases.find((p) => p.status === "active");

  function go(to: number) {
    setPlaying(false);
    setStep(normalizeStep(to, reused));
  }

  function togglePlay() {
    if (playing) return setPlaying(false);
    if (step === STAGES.length - 1) setStep(0);
    setPlaying(true);
  }

  function chooseConnection(next: boolean) {
    setReused(next);
    setStep((s) => normalizeStep(s, next));
  }

  return (
    <JourneyContext.Provider value={{ step, reused }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => go(prevStep(step, reused))} disabled={step === 0}>
            Previous
          </button>
          <button type="button" className="btn-primary" onClick={togglePlay}>
            {playing ? "Pause" : step === STAGES.length - 1 ? "Replay" : "Play"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => go(nextStep(step, reused))} disabled={step === STAGES.length - 1}>
            Next
          </button>
        </div>
        <div role="radiogroup" aria-label="Connection" className="inline-flex rounded-data border border-rule bg-canvas p-0.5">
          {[
            { v: false, label: "New connection" },
            { v: true, label: "Reused connection" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={reused === o.v}
              onClick={() => chooseConnection(o.v)}
              className={`rounded-[2px] px-3 py-1.5 text-xs transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                reused === o.v ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tr-wrap">{figure}</div>

      <div className="mt-5 rounded-data border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums text-muted">
          <span>Time budget of this call</span>
          <span>
            <span className="font-medium text-ink">{fmt(elapsed)}</span> of {fmt(state.totalMs)}
          </span>
        </div>
        <div className="relative mt-2 h-7 overflow-hidden rounded border border-rule bg-canvas" aria-hidden>
          {layout.map((s) => {
            const p = state.phases.find((x) => x.key === s.key)!;
            return (
              <div
                key={s.key}
                className={`absolute inset-y-0 ${PHASE_BG[s.key]} transition-opacity duration-300 ${p.status === "upcoming" ? "opacity-15" : ""}`}
                style={{
                  left: `${s.startPct}%`,
                  width: `${s.widthPct}%`,
                  boxShadow: p.status === "active" ? "inset 0 0 0 2px rgb(var(--ink))" : "inset -1px 0 0 rgb(var(--surface))",
                }}
              />
            );
          })}
        </div>
        <div className="relative mt-0.5 h-6 border-t border-rule" aria-hidden>
          {ticks.map((t, i) => {
            const pct = (t.ms / state.totalMs) * 100;
            const shift = i === 0 ? "0" : pct > 92 ? "-100%" : "-50%";
            return (
              <div key={t.ms} className="absolute top-0" style={{ left: `${pct}%` }}>
                <div className="h-1.5 w-px bg-rule" />
                <div className="mt-0.5 text-[11px] leading-none tabular-nums text-muted" style={{ transform: `translateX(${shift})` }}>
                  {t.label}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-right text-[11px] text-muted">Scale in {unit}. Sample data.</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ol className="space-y-0.5" aria-label="Stages of the call">
          {STAGES.map((s, i) => {
            const status = state.stages[i].status;
            const isActive = status === "active";
            const isSkipped = status === "skipped";
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={isSkipped}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => go(i)}
                  className={`flex w-full items-center gap-3 rounded-data border-l-2 px-3 py-2 text-left text-sm transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    isActive ? "border-l-accent bg-canvas font-medium text-ink" : "border-l-transparent hover:bg-canvas"
                  } ${isSkipped ? "cursor-not-allowed text-muted line-through" : status === "upcoming" ? "text-muted" : ""}`}
                >
                  <span aria-hidden className="w-4 shrink-0 text-center font-mono text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">{s.title}</span>
                  <span className="sr-only">
                    {isSkipped ? "skipped on a reused connection" : status === "done" ? "done" : isActive ? "current" : "next"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="rounded-data border border-rule bg-surface p-5" aria-live="polite">
          <h3 className="text-lg font-semibold tracking-[-0.01em]">{stage.title}</h3>
          {activePhase && (
            <p className="mt-1 text-sm tabular-nums text-muted">
              {fmt(activePhase.ms)} in this sample, {Math.round((activePhase.ms / state.totalMs) * 100)}% of the call
            </p>
          )}
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium">What happens</dt>
              <dd className="mt-1 text-muted">{stage.happens}</dd>
            </div>
            <div>
              <dt className="font-medium">What Tracewell records</dt>
              <dd className="mt-1 text-muted">{stage.records}</dd>
            </div>
            <div>
              <dt className="font-medium">If this is slow</dt>
              <dd className="mt-1 text-muted">{stage.slow}</dd>
            </div>
          </dl>
        </div>
      </div>
    </JourneyContext.Provider>
  );
}
