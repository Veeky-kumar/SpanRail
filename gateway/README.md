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

# or Docker (from the repo root; the gateway is opt-in via the `gateway` compose profile and is
# published on 127.0.0.1:8080 only)
export TRACEWELL_PUBLIC_KEY=pk-... TRACEWELL_SECRET_KEY=sk-...
docker compose --profile gateway up -d --build gateway
# with the production overlay:
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile gateway up -d --build gateway
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

By default these three share the proxy port, which means a `GET /healthz`, `/readyz` or `/metrics` aimed
at the upstream is answered by the gateway instead. Set `OPS_ADDR` (for example `127.0.0.1:9090`) to
serve them on a separate listener: the public port then proxies every path untouched, and the metrics
stay on a private interface. The container health check follows `OPS_ADDR` automatically.

## Configuration

All settings are environment variables. The gateway refuses to start with a clear message if one is invalid.

| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_URL` | **required** | provider base URL (http/https, no credentials) |
| `LISTEN_ADDR` | `:8080` | listen address |
| `UPSTREAM_TIMEOUT` | `10m` | wait for upstream **response headers**. A non-streaming completion sends none until it finishes, so keep this above your slowest generation (does not cut long streams) |
| `SHUTDOWN_TIMEOUT` | `15s` | time to finish in-flight requests, and again to flush reports, on SIGTERM |
| `OPS_ADDR` | unset | separate listener for `/healthz`, `/readyz`, `/metrics` (plain HTTP); unset = same port as the proxy |
| `DRAIN_DELAY` | `0` | after SIGTERM keep serving this long with `/readyz` = 503 so a load balancer notices |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | unset | serve HTTPS (both or neither); TLS 1.2+ |
| `REPORT_ENABLED` | `true` | `false` = plain proxy, no Tracewell keys needed |
| `TRACEWELL_BASE_URL` | `http://localhost:3000` | Tracewell web/API |
| `TRACEWELL_PUBLIC_KEY` / `TRACEWELL_SECRET_KEY` | required when reporting | project API keys (the secret is never printed or logged) |
| `BATCH_SIZE` | `50` (max 500) | events per ingestion request (a call is 2-3 events) |
| `FLUSH_INTERVAL` | `2s` | send a partial batch at least this often |
| `QUEUE_SIZE` | `1000` (max 100000) | calls buffered; beyond this new ones are dropped and counted |
| `REPORT_WORKERS` | `2` | background senders |
| `REPORT_MAX_ATTEMPTS` | `5` | tries per batch (exponential backoff with full jitter) |
| `REPORT_TIMEOUT` | `10s` | per HTTP attempt to Tracewell |
| `PEEK_BYTES` | `65536` (max 1 MiB) | request-body prefix read to find `model` |
| `PEEK_TIMEOUT` | `10s` | **stall** timeout for a POST body: the request fails (408) if no bytes arrive for this long. A slow but steadily progressing upload is not affected |
| `PARSE_MAX_BYTES` | `1048576` (max 16 MiB) | largest response held in memory to read `usage` from |
| `CAPTURE_BODIES` | `false` | also report request/response bodies (privacy: prompts leave your network) |
| `CAPTURE_MAX_BYTES` | `16384` (max 1 MiB) | cap on each reported body |
| `CAPTURE_HEADERS` | `false` | report request headers (redacted) |
| `REDACT_HEADERS` | empty | extra header names to redact (comma-separated). Any header whose name contains `key`, `token`, `secret`, `auth`, `cookie`, `session`, `passw` or `credential` is always redacted |

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
  parsed. A stream's usage is accepted only when it is complete (input and output both present), so
  those streams report unknown usage rather than a half-count.
* **Compressed event streams are not read.** If a provider or CDN gzips an SSE response, the stream is
  forwarded untouched and reported as streaming, but its usage, model and body are unknown.
* **Model name.** Taken from the first `PEEK_BYTES` of the request; if a very long prompt pushes
  `"model"` past that, the model the response reports is used instead.
* **Responses that cannot be read.** Brotli/zstd-encoded or non-JSON responses, and JSON larger than
  `PARSE_MAX_BYTES`, have unknown usage (a large embeddings batch can exceed 1 MiB; raise the limit,
  accepting that each in-flight response of that size is held in memory). Only gzip is decoded.
* **No cost.** There is no price table; Tracewell shows usage but no cost for these calls.
* **The gateway does not authenticate callers, and it holds your Tracewell secret key.** Anyone who can
  reach it can (a) send requests through to the upstream with whatever key they supply, (b) write
  arbitrary generations into your Tracewell project, and (c) attach them to any trace whose id they know via
  `X-Tracewell-Trace-Id`. Keep it on a private network or put authentication in front. The compose
  file binds it to `127.0.0.1` for this reason.
* **Plain HTTP carries your provider keys.** Clients send `Authorization: Bearer ...` through the
  gateway, so use TLS (`TLS_CERT_FILE`/`TLS_KEY_FILE`, or a terminator in front) for any hop that
  leaves a trusted network. `UPSTREAM_URL` and `TRACEWELL_BASE_URL` also accept `http://`; the compose
  defaults use it only inside the compose network or to the host.
* **`Accept-Encoding` is rewritten.** If the client accepts gzip, the gateway asks the provider for
  `gzip` (clients like browsers and Node also offer br/zstd, which it cannot read usage from). A client
  that does not accept gzip is left alone, and then usage is unknown for that call.
* **Client addresses are not forwarded.** `X-Forwarded-*` and `Forwarded` are not sent to the provider.
* **Slow readers.** A client that accepts a response very slowly can hold a connection and its
  upstream connection open; there is deliberately no write timeout (it would cut idle SSE streams).
  Limits on connections belong in the load balancer in front. Slow *senders* are handled (`PEEK_TIMEOUT`).
* **TLS certificates are loaded at startup.** A renewed certificate on disk is not picked up until the
  gateway restarts; terminate TLS in front of it if you need rotation without restarts.
* **Environment proxies.** The upstream HTTP client honours `HTTPS_PROXY`/`HTTP_PROXY`; if set in the
  container environment, provider traffic (with your keys) goes through that proxy.
* **Go version.** Build with Go 1.27.2 or newer. Earlier 1.27.x releases have standard-library
  vulnerabilities that `govulncheck` reports for this code; `go.mod` requires 1.27.2.
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
