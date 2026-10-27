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
