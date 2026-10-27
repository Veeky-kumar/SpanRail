// Illustrative data for product visuals (login panel, landing page). It is labelled "Sample data"
// wherever it is shown; it is not read from, or written to, any project.
export const SAMPLE_MODEL = "example-model-small";

export const SAMPLE_GATEWAY_METADATA = {
  gateway: {
    status: 200,
    connReused: false,
    streaming: false,
    timingMs: { dns: 44.3, connect: 0.5, tls: 21.2, ttfb: 267, total: 374 },
  },
};

// The same call on a reused keep-alive connection: no DNS, connect or TLS phase exists.
export const SAMPLE_REUSED_METADATA = {
  gateway: {
    status: 200,
    connReused: true,
    streaming: false,
    timingMs: { ttfb: 201, total: 308 },
  },
};

// A small sample trace for the landing page: spans on one shared time axis (milliseconds).
export const SAMPLE_TRACE_MS = 612;
export const SAMPLE_SPANS = [
  { name: "agent.run", type: "span", start: 0, dur: 612, depth: 0 },
  { name: "retrieve-context", type: "span", start: 18, dur: 96, depth: 1 },
  { name: "chat.completions", type: "generation", start: 130, dur: 374, depth: 1 },
  { name: "tool.search", type: "span", start: 512, dur: 84, depth: 1 },
] as const;
