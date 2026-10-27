// Reads the network timing that the Go gateway (gateway/) stores under
// observation.metadata.gateway. Pure functions so the rules can be unit-tested.
//
// The gateway reports a phase only if it actually happened (a reused keep-alive connection
// has no DNS/connect/TLS), so a missing phase here means "did not happen", never "zero".

export type TimingPhaseKey = "dns" | "connect" | "tls" | "wait" | "transfer";

export interface TimingPhase {
  key: TimingPhaseKey;
  label: string;
  ms: number;
}

export interface GatewayTiming {
  phases: TimingPhase[];
  totalMs: number;
  ttfbMs: number | null;
  connReused: boolean | null;
  status: number | null;
}

export const LABELS: Record<TimingPhaseKey, string> = {
  dns: "DNS lookup",
  connect: "TCP connect",
  tls: "TLS handshake",
  wait: "Upstream wait",
  transfer: "Response transfer",
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ms(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Returns the timing breakdown for a gateway-reported generation, or null if the observation
 * has no (valid) gateway timing. TTFB is measured from the start of the upstream round trip,
 * so it already contains DNS, connect and TLS: "Upstream wait" is what remains after them
 * (the provider's own processing plus any wait for a pooled connection), and "Response
 * transfer" is the time from the first byte to the end of the response.
 */
export function parseGatewayTiming(metadata: unknown): GatewayTiming | null {
  if (!isObject(metadata) || !isObject(metadata.gateway)) return null;
  const gw = metadata.gateway;
  if (!isObject(gw.timingMs)) return null;
  const t = gw.timingMs;

  const total = ms(t.total);
  if (total === null) return null;

  const phases: TimingPhase[] = [];
  let setup = 0;
  for (const key of ["dns", "connect", "tls"] as const) {
    const v = ms(t[key]);
    if (v !== null) {
      phases.push({ key, label: LABELS[key], ms: v });
      setup += v;
    }
  }

  const ttfb = ms(t.ttfb);
  if (ttfb !== null) {
    phases.push({ key: "wait", label: LABELS.wait, ms: Math.max(0, ttfb - setup) });
    phases.push({ key: "transfer", label: LABELS.transfer, ms: Math.max(0, total - ttfb) });
  }

  return {
    phases,
    totalMs: total,
    ttfbMs: ttfb,
    connReused: typeof gw.connReused === "boolean" ? gw.connReused : null,
    status: typeof gw.status === "number" ? gw.status : null,
  };
}
