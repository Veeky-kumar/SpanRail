# tracewell-gateway

A small Go reverse proxy that sits in front of an OpenAI-compatible LLM API. It forwards every
request unchanged and reports each call to [Tracewell](../README.md) as a **generation**, including
where the time went on the network: DNS, TCP connect, TLS handshake and time to first byte.

```
your app --> tracewell-gateway --> LLM provider
                   |
                   +--(async, batched)--> Tracewell  POST /api/public/ingestion
```

* Standard library plus one dependency (`prometheus/client_golang`).
* Never blocks a request to report it: a bounded queue drops (and counts) events if Tracewell is slow.
* Never forwards or reports your provider key. Request/response bodies are **not** reported unless you turn that on.

See [RESULTS.md](./RESULTS.md) for what was measured and [docs/LEARNING.md](./docs/LEARNING.md)
for a walkthrough of the code.

## Quick start

You need a running Tracewell (web + worker) and a project key pair (`npm run db:seed` prints one).

```bash
# native
cd gateway
UPSTREAM_URL=https://api.openai.com \
TRACEWELL_BASE_URL=http://localhost:3000 \
TRACEWELL_PUBLIC_KEY=pk-... TRACEWELL_SECRET_KEY=sk-... \
go run ./cmd/gateway

# or Docker (from the repo root; the gateway service is behind a compose profile)
export TRACEWELL_PUBLIC_KEY=pk-... TRACEWELL_SECRET_KEY=sk-...
docker compose --profile gateway up -d --build gateway
```

Point an OpenAI-compatible client at it by changing only the base URL. Your provider key stays in
the client and goes straight through:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="sk-your-provider-key")
client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": "hi"}])
```

Set `UPSTREAM_URL` without `/v1` when the client's base URL already ends in `/v1` (the path is appended).

### Attach calls to an existing trace

```bash
curl localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "X-Tracewell-Trace-Id: my-existing-trace" \
  -H "X-Tracewell-Parent-Observation-Id: my-span" \
  -d '{"model":"gpt-4o-mini","messages":[]}'
```

Without these headers each call starts its own trace. Ids must match `[A-Za-z0-9_.:-]{1,128}`;
anything else is ignored (the call still succeeds). `X-Tracewell-*` headers are removed before
the request goes to the provider.

### Try it without a paid key

```bash
go run ./cmd/fakeupstream -addr 127.0.0.1:9000 -latency 40ms     # fake OpenAI-compatible server
UPSTREAM_URL=http://localhost:9000 ... go run ./cmd/gateway
```

## What is reported

For each `POST` the gateway sends a `generation-create` and a `generation-update` (plus a
`trace-create` when it starts a new trace). The update carries, under `metadata.gateway`:

| Field | Meaning |
|---|---|
| `status`, `streaming`, `responseBytes` | response status, whether it was SSE, bytes sent to the client (wire size) |
| `timingMs.total` | gateway-observed duration |
| `timingMs.ttfb` | start of the upstream round trip to its first response byte (**includes** DNS, connect and TLS) |
| `timingMs.dns` / `connect` / `tls` | present **only when that phase happened**; a reused keep-alive connection has none of them |
| `connReused` | whether a pooled connection was used |
| `requestHeaders` | only with `CAPTURE_HEADERS=true`; `Authorization`, cookies and API-key headers are always `[REDACTED]` |

`usageDetails` (`input`/`output`/`total`) is set only when the provider reported usage. Unknown stays
unknown: it is omitted, never `0`. The gateway has no price table, so it never sends `costDetails`.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /healthz` | process is alive (always 200) |
| `GET /readyz` | 200 normally, 503 while shutting down |
| `GET /metrics` | Prometheus metrics (`tracewell_gateway_*`): requests by status, latency, per-phase histograms, queue depth, dropped events, flush failures |
| anything else | proxied to the upstream |

## Configuration

All settings are environment variables. The gateway refuses to start with a clear message if one is invalid.

| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_URL` | **required** | provider base URL (http/https, no credentials) |
| `LISTEN_ADDR` | `:8080` | listen address |
| `UPSTREAM_TIMEOUT` | `60s` | wait for upstream **response headers** (does not cut long streams) |
| `SHUTDOWN_TIMEOUT` | `15s` | time to finish in-flight requests, and again to flush reports, on SIGTERM |
| `DRAIN_DELAY` | `0` | after SIGTERM keep serving this long with `/readyz` = 503 so a load balancer notices |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | unset | serve HTTPS (both or neither); TLS 1.2+ |
| `REPORT_ENABLED` | `true` | `false` = plain proxy, no Tracewell keys needed |
| `TRACEWELL_BASE_URL` | `http://localhost:3000` | Tracewell web/API |
| `TRACEWELL_PUBLIC_KEY` / `TRACEWELL_SECRET_KEY` | required when reporting | project API keys (the secret is never printed or logged) |
| `BATCH_SIZE` | `50` (max 500) | events per ingestion request (a call is 2-3 events) |
| `FLUSH_INTERVAL` | `2s` | send a partial batch at least this often |
| `QUEUE_SIZE` | `1000` | calls buffered; beyond this new ones are dropped and counted |
| `REPORT_WORKERS` | `2` | background senders |
| `REPORT_MAX_ATTEMPTS` | `5` | tries per batch (exponential backoff with full jitter) |
| `REPORT_TIMEOUT` | `10s` | per HTTP attempt to Tracewell |
| `PEEK_BYTES` | `65536` | request-body prefix read to find `model` |
| `PEEK_TIMEOUT` | `10s` | how long a client may stall while that prefix is read |
| `PARSE_MAX_BYTES` | `1048576` | largest response held in memory to read `usage` from |
| `CAPTURE_BODIES` | `false` | also report request/response bodies (privacy: prompts leave your network) |
| `CAPTURE_MAX_BYTES` | `16384` | cap on each reported body |
| `CAPTURE_HEADERS` | `false` | report request headers (redacted) |
| `REDACT_HEADERS` | empty | extra header names to redact (comma-separated) |

## Development

```bash
cd gateway
gofmt -l . && go vet ./... && go test -race ./...
bash scripts/e2e.sh      # needs a running Tracewell stack; see the script header
bash scripts/bench.sh    # overhead and throughput measurement
```

## Known limitations (read before relying on it)

* **Streaming usage.** OpenAI only includes `usage` in a stream when the *client* sets
  `stream_options.include_usage`. The gateway does not rewrite requests, so otherwise streamed calls
  have unknown usage.
* **OpenAI-shaped usage only.** Anthropic-style streaming (usage split across `message_start` and
  `message_delta`) and OpenAI *Responses* streaming (usage nested under `response.completed`) are not
  parsed, so those streams report unknown usage.
* **Model name.** Taken from the first `PEEK_BYTES` of the request; if a very long prompt pushes
  `"model"` past that, the model the response reports is used instead.
* **Responses that cannot be read.** Brotli/zstd-encoded or non-JSON responses, and JSON larger than
  `PARSE_MAX_BYTES`, have unknown usage. Only gzip is decoded.
* **No cost.** There is no price table; Tracewell shows usage but no cost for these calls.
* **The gateway does not authenticate callers.** Anyone who can reach it can send requests through
  to the upstream with whatever key they supply. Keep it on a private network or put auth in front.
* **One upstream and one Tracewell project per instance.** Run several instances for several.
* **At-most-once, in memory.** The report queue is not persisted. A crash or `kill -9` loses queued
  events, and a batch Tracewell rejects or cannot accept after all retries is lost (counted in
  `report_flush_failures_total`).
* **TTFB definition.** It starts at the beginning of the upstream round trip, so it includes
  DNS/connect/TLS on a new connection. Compare calls with the same `connReused` value.
* **Timing against a real provider is unverified.** DNS/connect/TLS/TTFB were verified against local
  servers (plain HTTP and an `httptest` TLS server), not against a real HTTPS provider or HTTP/2.
* **Docker stop timeout.** Give the container a grace period of at least
  `DRAIN_DELAY + 2 x SHUTDOWN_TIMEOUT`. The compose file sets 40s. A bare `docker stop` on a Docker
  Desktop setup with a 1s default grace period kills the process mid-flush (observed during testing).
* **Clock resolution.** On the Windows machine used for benchmarks Go's clock steps in ~0.54 ms, so
  sub-millisecond latencies there are quantised.
