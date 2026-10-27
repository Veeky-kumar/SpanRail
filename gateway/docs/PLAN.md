# Plan: spanrail-gateway (Go reverse proxy -> Spanrail generations)

## Context
Add `gateway/` (own go.mod) to Spanrail: a reverse proxy in front of an OpenAI-compatible API that
reports each call to `POST /api/public/ingestion` as a generation, with DNS/TCP/TLS/TTFB timings.
Portfolio piece for a network-ops team; everything must be tested and explainable.

## Findings from Step 0 (read, not guessed)
- Skills: none of the `superpowers:*` skills are installed. Installed and usable: `code-review`,
  `security-review`, `engineering:documentation`, `engineering:testing-strategy`, `dataviz`,
  `frontend-design`. I will follow the same discipline by hand (plan -> worktree -> TDD ->
  debug root cause -> evidence before "done" -> review -> finish branch).
- Go is NOT installed (`go: command not found`). Install: `winget install GoLang.Go`, then reopen terminal.
  Blocks all code. No `.github/workflows` exists -> I will not invent CI silently; M6 proposes a new
  `.github/workflows/gateway.yml` (Go-only) and asks first.
- Ingestion contract (`src/ingest/schema.ts`, `src/app/api/public/ingestion/route.ts`):
  - `POST {batch:[event...]}` (1..1000), `Authorization: Basic base64(public:secret)`, returns 207
    `{successes, errors}`; per-event status, so the reporter must inspect per-event errors, not just HTTP status.
  - Envelope `{id, timestamp(ISO), type, body}`. Idempotent on `(project, event.id)` -> safe to retry.
  - A trace is its own root observation: `trace-create` with `id === traceId`, `parentObservationId: null`.
  - `generation-create` body: `id, traceId, parentObservationId, startTime, name, input, metadata, model, modelParameters`.
  - `generation-update` body: `id, traceId, endTime, output, level, statusMessage, metadata, usageDetails{string:number}, costDetails`.
- Worker (`worker/processors/ingestion.ts`) merges create/update by field, out-of-order safe, BUT
  `metadata` is replaced wholesale, not deep-merged -> put timing metadata ONLY on the update event.
  Cost: worker sums `costDetails` only if sent; gateway has no price table, so it omits costDetails (unknown, never invented).
- UI (`TraceExplorer.tsx`) shows `usageDetails` as JSON; SDK convention `{input, output, total}`.

## Example payload the gateway will send (per proxied call, new trace)
```json
{"batch":[
 {"id":"<uuid>","timestamp":"2026-10-20T10:00:00.000Z","type":"trace-create",
  "body":{"id":"T","traceId":"T","parentObservationId":null,"startTime":"...","name":"gateway POST /v1/chat/completions"}},
 {"id":"<uuid>","timestamp":"...","type":"generation-create",
  "body":{"id":"G","traceId":"T","parentObservationId":"T","startTime":"...","name":"chat.completions","model":"gpt-4o-mini"}},
 {"id":"<uuid>","timestamp":"...","type":"generation-update",
  "body":{"id":"G","traceId":"T","endTime":"...","level":"DEFAULT","usageDetails":{"input":12,"output":5,"total":17},
   "metadata":{"gateway":{"status":200,"streaming":false,"responseBytes":412,
     "timingMs":{"dns":3.1,"connect":8.4,"tls":21.7,"ttfb":140.2,"total":180.5}}}}}
]}
```
With `X-Spanrail-Trace-Id` (+ optional `X-Spanrail-Parent-Observation-Id`): skip `trace-create`, use that traceId and parent.
Status >=500 / transport error -> `level:"ERROR"` + `statusMessage`. Usage unknown -> `usageDetails` omitted.
Input/output bodies only if body capture enabled (byte-capped).

## Design
```
gateway/
  go.mod  cmd/gateway/main.go
  internal/config   env parsing + fail-fast validation
  internal/proxy    httputil.ReverseProxy (Rewrite, FlushInterval=-1 for SSE), httptrace ClientTrace via Transport wrapper
  internal/capture  bounded request-body peek (model), response tee (size cap, SSE usage-chunk scan)
  internal/redact   header redaction (Authorization always, plus configured list)
  internal/report   bounded chan -> N workers -> batcher (size/time flush) -> HTTP client w/ backoff+jitter; drop+count when full; Close(ctx) drains
  internal/metrics  prometheus registry (counts, latency/DNS/connect/TLS/TTFB histograms, queue depth, dropped, flush failures)
  internal/server   mux: /, /healthz, /readyz (upstream+reporter state), /metrics; optional TLS; SIGTERM graceful shutdown
  docs/PLAN.md docs/LEARNING.md README.md RESULTS.md Dockerfile
```
Key decisions:
- Request body is read up to cap to extract `model`, then restored via `io.MultiReader` so the forwarded body is byte-identical (no truncation of what upstream receives).
- Response passes through a tee writer that never buffers the stream; SSE usage is taken only from the final `data:` chunk if the provider sent one (OpenAI sends usage in streams only when the client sets `stream_options.include_usage`; gateway will NOT rewrite requests, so otherwise usage = unknown. Documented gap.)
- httptrace hooks: DNSStart/Done, ConnectStart/Done, TLSHandshakeStart/Done, GotFirstResponseByte. Reused (keep-alive) connections legitimately report 0 for dns/connect/tls -> recorded as `reused:true`, not faked.
- Reporter never blocks the request path (non-blocking send, default case drops + increments counter). Retry on network error/5xx/429 with exponential backoff + full jitter, cap attempts; 4xx per-event errors logged, not retried. Shutdown: stop accepting, drain queue, final flush bounded by timeout.
- SSRF: upstream URL is fixed config only (never taken from request); validate scheme http/https at startup. Strip hop-by-hop and `X-Spanrail-*` headers before forwarding; validate trace-id header format (length/charset) to prevent injection. Authorization never logged/reported; request/response bodies off by default.
- Deps: stdlib + `github.com/prometheus/client_golang` only (your pre-approved one).

## Milestones (commit after each, on branch `feat/go-gateway` in a git worktree, e.g. `D:\Projects\spanrail-gateway-wt`)
1. Scaffold, config, /healthz, plain reverse proxy + tests.
2. Capture, usage parsing, SSE passthrough + tests (flush ordering test with slow chunked upstream).
3. httptrace timings + Prometheus metrics.
4. Async reporter (batch/retry/drop/shutdown) -> **code review**.
5. Trace-id propagation + real ingestion integration + E2E (docker compose postgres/redis + web/worker, fake OpenAI upstream, verify rows in DB/dashboard via browser).
6. Dockerfile (multi-stage, static, distroless/scratch, non-root), `gateway` service added to compose files (additive), CI workflow (ask first), benchmarks, RESULTS.md -> **code review**, then `/security-review`.
7. Optional UI timing breakdown in `TraceExplorer.tsx` (skip if risky; touches existing page, will ask).
Docs: README, ARCHITECTURE.md "Go gateway" section (verified / not verified / gaps), LEARNING.md per milestone
(+ 5 interview Qs, and a list of pieces you should type yourself: httptrace transport wrapper, reporter batch loop, SSE tee).

## Verification
`gofmt -l`, `go vet ./...`, `go test -race -count=1 ./...` (+ staticcheck/golangci-lint if installable), coverage list in RESULTS.md;
E2E with output shown; benchmark p50/p95 proxy-vs-direct against fake upstream with machine/method recorded; only measured numbers reported.

## Needs your decision / action before coding
1. Install Go (`winget install GoLang.Go`) — I cannot proceed otherwise.
2. Approve: `prometheus/client_golang` dependency; creating `.github/workflows/gateway.yml` (none exists today); worktree path.
3. Scope default I'm assuming: OpenAI-compatible APIs (chat/completions, completions, embeddings), Spanrail keys supplied via env (one project per gateway instance).
