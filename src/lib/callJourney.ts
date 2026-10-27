// The "life of a call" explainer: one LLM call through the Tracewell gateway, stage by stage.
// Pure data and rules so the order, the skipped stages and the sums are unit-tested; the React
// component only draws what this returns. Every statement below describes what the gateway
// really does (gateway/README.md, gateway/internal/nettrace, gateway/internal/report).
import { parseGatewayTiming, type TimingPhaseKey } from "@/lib/gatewayTiming";
import { SAMPLE_GATEWAY_METADATA, SAMPLE_REUSED_METADATA } from "@/lib/sampleTrace";

export type StageKey = "request" | "dns" | "connect" | "tls" | "wait" | "transfer" | "report";

export interface Stage {
  key: StageKey;
  title: string;
  /** What happens at this point of the call. */
  happens: string;
  /** What Tracewell records here. */
  records: string;
  /** What an unusually large value usually points to. */
  slow: string;
  /** The time-budget phase this stage fills in, if it is one. */
  phase: TimingPhaseKey | null;
  /** True for the stages a reused keep-alive connection does not need. */
  skippedWhenReused: boolean;
}

export const STAGES: Stage[] = [
  {
    key: "request",
    title: "Your app sends the request",
    happens: "Your client talks to the gateway instead of the provider. The request is forwarded unchanged, and your provider key stays in the request; it is never stored.",
    records: "The start time and, from the start of the request body, the model name.",
    slow: "Not timed: the gateway adds roughly half a millisecond on a local network (see the measurements below).",
    phase: null,
    skippedWhenReused: false,
  },
  {
    key: "dns",
    title: "DNS lookup",
    happens: "The gateway looks up the provider's address. When it already holds an open connection it skips this step.",
    records: "The lookup time.",
    slow: "A slow resolver or a DNS problem on the network the gateway runs on.",
    phase: "dns",
    skippedWhenReused: true,
  },
  {
    key: "connect",
    title: "TCP connect",
    happens: "The gateway opens a connection to the provider. If the host has several addresses they race, and the winner counts.",
    records: "How long the successful connection took to open.",
    slow: "Distance to the provider, a poor route, or a firewall in the way.",
    phase: "connect",
    skippedWhenReused: true,
  },
  {
    key: "tls",
    title: "TLS handshake",
    happens: "The two sides agree on encryption before any request data is sent.",
    records: "The handshake time, only for https upstreams.",
    slow: "Certificate checks, an inspecting proxy, or a long network round trip.",
    phase: "tls",
    skippedWhenReused: true,
  },
  {
    key: "wait",
    title: "The provider thinks",
    happens: "The request is with the provider. Time to first byte is measured from the start of the round trip, so Tracewell subtracts the setup above to isolate this wait.",
    records: "Time to first byte, and from it the provider's own wait.",
    slow: "The provider is busy, the model is slow, or the prompt is large. This is usually the biggest segment.",
    phase: "wait",
    skippedWhenReused: false,
  },
  {
    key: "transfer",
    title: "The response comes back",
    happens: "The answer streams back through the gateway without being buffered, so a streamed reply still arrives token by token.",
    records: "Status, response size, and token usage only when the provider reports it. Unknown stays unknown.",
    slow: "A long answer, or a slow link between the gateway and your app.",
    phase: "transfer",
    skippedWhenReused: false,
  },
  {
    key: "report",
    title: "Reported to Tracewell",
    happens: "The gateway queues the call and sends batches to Tracewell in the background. It never makes your call wait, and if the queue is full the event is dropped and counted.",
    records: "A trace with one generation: model, status, usage if known, and the time budget.",
    slow: "Not on the request path: a slow Tracewell never slows your calls.",
    phase: null,
    skippedWhenReused: false,
  },
];

export type StageStatus = "done" | "active" | "upcoming" | "skipped";
export type PhaseStatus = "done" | "active" | "upcoming";

export interface JourneyState {
  stages: { key: StageKey; status: StageStatus }[];
  phases: { key: TimingPhaseKey; label: string; ms: number; status: PhaseStatus }[];
  totalMs: number;
}

const LAST = STAGES.length - 1;

function skipped(index: number, reused: boolean): boolean {
  return reused && STAGES[index].skippedWhenReused;
}

/** Clamp into range and move off a stage that a reused connection does not have. */
export function normalizeStep(step: number, reused: boolean): number {
  let i = Math.min(Math.max(Math.trunc(step), 0), LAST);
  while (i < LAST && skipped(i, reused)) i++;
  return i;
}

export function nextStep(step: number, reused: boolean): number {
  let i = Math.min(Math.max(step, 0), LAST);
  do i++;
  while (i <= LAST && skipped(i, reused));
  return i > LAST ? LAST : i;
}

export function prevStep(step: number, reused: boolean): number {
  let i = Math.min(Math.max(step, 0), LAST);
  do i--;
  while (i >= 0 && skipped(i, reused));
  return i < 0 ? 0 : i;
}

/** What is done, active, upcoming or skipped when the reader is at `step`. */
export function journeyState(step: number, reused: boolean): JourneyState {
  const at = Math.min(Math.max(Math.trunc(step), 0), LAST);
  const timing = parseGatewayTiming(reused ? SAMPLE_REUSED_METADATA : SAMPLE_GATEWAY_METADATA);
  if (!timing) throw new Error("sample timing metadata is invalid");

  const stages = STAGES.map((s, i) => ({
    key: s.key,
    status: (skipped(i, reused) ? "skipped" : i < at ? "done" : i === at ? "active" : "upcoming") as StageStatus,
  }));

  const phases = timing.phases.map((p) => {
    const index = STAGES.findIndex((s) => s.phase === p.key);
    const status: PhaseStatus = index < at ? "done" : index === at ? "active" : "upcoming";
    return { key: p.key, label: p.label, ms: p.ms, status };
  });

  return { stages, phases, totalMs: timing.totalMs };
}
