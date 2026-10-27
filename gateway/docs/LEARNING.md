# Learning notes

Plain-language notes on the code, added after each milestone.

## Milestone 1: config, reverse proxy, /healthz

### How a request flows
```
client -> http.Server -> mux (server.Handler)
                          |- GET /healthz -> "ok"
                          '- everything else -> httputil.ReverseProxy (proxy.New)
                                                   Rewrite: point the outbound request at the upstream
                                                   Transport: dial upstream, wait up to UPSTREAM_TIMEOUT for headers
                                                   copy status, headers and body back to the client
```

### Key pieces
- **`config.Load(getenv)`** takes the lookup function as a parameter. Production passes
  `os.Getenv`; tests pass a map. That is why the config tests need no process environment
  and can run in parallel. It returns an error naming the variable, and `main` exits with it
  (fail fast) instead of starting half-configured.
- **`Rewrite` vs `Director`.** `ReverseProxy` gives `Rewrite` a copy of the inbound request
  with hop-by-hop headers (`Connection`, `Keep-Alive`, ...) and client-sent `X-Forwarded-*`
  already removed. A client cannot smuggle those past us. `SetURL` also joins the upstream's
  path prefix, so `UPSTREAM_URL=https://host/api` plus `/v1/models` becomes `/api/v1/models`.
- **The upstream is fixed config.** No header or path from the client can change where traffic
  goes. That is the SSRF defence. Credentials in `UPSTREAM_URL` are rejected so a secret never
  ends up in a log line.
- **`ResponseHeaderTimeout`, not `Client.Timeout`.** It bounds the wait for the upstream to
  *start* answering but not the body, so a long SSE stream is not killed. A whole-request
  timeout would cut streams (milestone 2).
- **`FlushInterval: -1`** flushes after every write. Without it, chunks of a streamed answer
  sit in a buffer. The test for this lands in milestone 2.
- **Error mapping.** Timeout -> 504, any other transport error -> 502, client cancelled -> write
  nothing. The client sees a generic message; the detail goes only to our log.
- **Graceful shutdown.** `signal.NotifyContext` turns SIGTERM into a cancelled context. `main`
  then calls `srv.Shutdown` with a deadline, which stops accepting connections and waits for
  in-flight requests.

### Interview questions
1. *Why `Rewrite` instead of `Director`?* `Director` mutates the inbound request and hop-by-hop
   headers are stripped *after* it runs, so a `Connection:` header listing a header can remove
   headers your `Director` added. `Rewrite` works on a separate outbound copy and the stripping
   happens first.
2. *Why does a 504 come from `ResponseHeaderTimeout` but a slow stream does not time out?* The
   timeout only covers the interval between finishing the request and receiving response headers.
3. *What happens to the request body when the upstream is down?* The transport fails at dial time,
   `ErrorHandler` runs, the client gets 502. The body is never read beyond what the transport tried to send.
4. *How would a client abuse a proxy that read the upstream from a header?* Point it at internal
   addresses (cloud metadata, localhost admin ports): SSRF. Ours reads the upstream once at startup.
5. *Why pass `getenv` into `Load`?* Dependency injection by function value: no global state, so
   tests are hermetic and parallel-safe.

### Pieces to type yourself (so you can defend them)
`config.Load` and `duration`, the `Rewrite` + `ErrorHandler` in `proxy.New`, and the shutdown
sequence in `main`. They are short and are the first things an interviewer asks about.

## Milestone 2: capture, usage parsing, SSE passthrough

### The idea: look, don't touch
Everything the gateway learns comes from a side copy. The bytes between client and upstream
are never changed or delayed.

- **Request:** `capture.PeekRequest` reads up to `PEEK_BYTES` of the body, finds the top-level
  `model` and `stream` keys with `json.Decoder` tokens (so a truncated body still yields what came
  before the cut), then puts the body back together with `io.MultiReader(prefix, restOfBody)`.
  Only the prefix sits in memory. A 200 KB prompt still streams through.
- **Response:** `observe.recorder` is an `http.ResponseWriter` that forwards every `Write`
  to the real writer first and only then copies the bytes into a bounded buffer. It also
  implements `Flush` (so SSE chunks leave immediately) and `Unwrap` (so `http.ResponseController`
  can still reach the real connection).
- **Usage:** non-streaming JSON is parsed after the response ends (gzip is decoded with a size
  limit). For SSE, `SSEUsageScanner` is an `io.Writer` fed chunk by chunk. It splits lines itself,
  so it does not matter where the network cut the stream. It keeps the last `data:` line holding
  a non-null `usage`.
- **Never invent numbers.** `Usage` is a `map[string]int64` containing only the keys the provider
  sent. `nil` means unknown. `total` is derived only when both input and output are present.
- **Known gap:** OpenAI sends usage in a stream only if the client asked with
  `stream_options.include_usage`. We do not edit requests, so otherwise streamed usage is unknown.
- **Redaction:** `redact.Headers` always masks `Authorization`, cookies and common API-key
  headers, plus any names in `REDACT_HEADERS`. Headers and bodies are not reported unless
  `CAPTURE_HEADERS` / `CAPTURE_BODIES` are turned on.

### How the streaming test proves no buffering
The fake upstream sends one SSE chunk, flushes, then *waits for the test to release it*. The
client must receive that first chunk while the upstream is still blocked. If the proxy buffered,
the client would get nothing until the upstream finished, which never happens, so the test fails by
deadline. I checked this by breaking `Flush` on purpose: the test failed with
"stream is buffered" (and an earlier version of the test hung instead of failing, which is why the
deadline now covers the request itself).

### Interview questions
1. *How do you read the body for `model` and still forward it?* Read a bounded prefix, then
   `MultiReader(prefix, original)`. Memory is bounded by the peek size, not the body size.
2. *Why `Unwrap` on the recorder?* Wrapping a ResponseWriter hides optional interfaces
   (Flusher, Hijacker). `ResponseController` follows `Unwrap` to find them.
3. *Why scan SSE with a stateful line splitter?* TCP delivers arbitrary slices; a JSON line can be
   split anywhere. The test feeds the stream 1 byte at a time to prove independence.
4. *What stops a malicious upstream exhausting memory?* Response buffer limit, SSE line limit,
   gzip expansion limit (`io.LimitReader`).
5. *Why is unknown usage better than an estimate?* This data feeds cost reporting; a guessed
   number looks real and is wrong, an absent one is visibly missing.

### Pieces to type yourself
`PeekRequest` + `scanTopLevel`, the `recorder.Write/Flush/Unwrap` trio, and `SSEUsageScanner.Write`.

## Milestone 3: network timings and Prometheus metrics

### How DNS / TCP / TLS / TTFB are measured
`net/http/httptrace` lets you attach a `ClientTrace` to a request's context. The standard library
calls your function at fixed moments of the request's life. We record the time at each moment and
subtract:

| Phase | Start hook | End hook | Note |
|---|---|---|---|
| DNS | `DNSStart` | `DNSDone` | absent if the host is an IP, or the connection was reused |
| TCP connect | `ConnectStart` | `ConnectDone` (err == nil) | with dual-stack hosts several connects race; only the winner counts |
| TLS | `TLSHandshakeStart` | `TLSHandshakeDone` | absent for plain http or a reused connection |
| TTFB | start of `RoundTrip` | `GotFirstResponseByte` | includes DNS + connect + TLS + the upstream's own think time |

- `nettrace.Transport` wraps the real transport. If the request context carries a `*Timings`, it
  calls `begin()` and attaches the trace; otherwise it forwards untouched.
- The hooks run on different goroutines (the dialer has its own), so `Timings` uses a mutex.
- **A phase that did not happen stays `nil`**, not 0. On a reused keep-alive connection there is no
  DNS/connect/TLS, and a `0` would look like "instant network" when the truth is "not measured".
  `GotConn(Reused)` tells us which case we are in.
- Tests inject a fake clock into `Timings`, call the hooks by hand and assert exact durations
  (20ms DNS + 30ms connect + 40ms TLS + 100ms wait = 191ms TTFB). Separate tests use real
  `httptest` servers to prove the hooks really fire (plain, TLS, name lookup, reuse).

### Metrics
- Private `prometheus.Registry` (not the global one) so tests can build many instances.
- Histograms use buckets from 1 ms doubling up to ~33 s, which covers a LAN hop and a slow completion.
- A phase histogram is only observed when the phase was measured, so its `_count` is the number of
  times DNS/connect/TLS really happened.
- `/healthz` = alive (always 200). `/readyz` = take traffic (503 while draining on SIGTERM).
  Separate endpoints so an orchestrator stops routing without killing a process that is still
  finishing in-flight requests.

### Interview questions
1. *Why can TTFB be smaller than the sum shown in a browser's waterfall?* Definitions differ. Ours
   starts at the beginning of the round trip and includes setup phases; a browser may split
   "waiting" from "connecting".
2. *Why are DNS/TLS pointers rather than numbers?* To tell "0 ms" from "did not happen".
3. *What does Go's `ConnectStart` fire for when a host has IPv4 and IPv6?* Once per attempt (RFC 8305
   "happy eyeballs"); we key starts by address and keep the successful one.
4. *Why a private registry?* The default registry is a process-wide global; registering twice panics.
5. *Why is a reused connection interesting to a network team?* It shows whether keep-alive pooling
   works; a high share of new connections means handshake cost on every call.

### Pieces to type yourself
`Timings.clientTrace()` and `Transport`, and `Metrics.ObserveRequest`.

## Milestone 4: the async reporter

### Shape
```
request goroutine --Enqueue--> [ bounded chan of Observation ] --> worker goroutines --> batch --> HTTPSender --> Spanrail
   (never blocks)                    (QUEUE_SIZE)                 (size OR interval)    (retry + backoff)
```
- **`Enqueue` uses `select` with a `default`.** If the channel is full it takes the default branch,
  increments `dropped_total` and returns false. The proxied call is never delayed to log it.
- **Workers own their batch.** Each worker loops on `select { case o := <-queue; case <-ticker.C }`.
  A batch flushes when it reaches `BATCH_SIZE` events or when the ticker fires, whichever is first.
- **Retry is the reporter's job, classification is the sender's.** `Sender.Send` returns a `Result`:
  accepted, rejected for good (4xx, auth), or retryable (network error, 429, 5xx). Only the
  retryable events are sent again. Spanrail's ingestion is idempotent per event id, so a retry
  can never create duplicates.
- **Backoff with full jitter:** the ceiling doubles per attempt up to a cap, and the actual wait is a
  random point below it. Without jitter, every gateway retries at the same instant after an outage.
- **207 Multi-Status** means the HTTP call worked but individual events may have failed, so the
  sender reads the per-event list. Validation errors are keyed by event id, storage errors by entity id.
- **Graceful shutdown order (in `main`):** `/readyz` -> 503, `srv.Shutdown` waits for in-flight
  requests (they may still enqueue), *then* `reporter.Close`, which closes the channel. Workers
  drain what is left, flush, and exit. Closing the channel before in-flight requests finish would
  make a late `Enqueue` send on a closed channel and panic, hence the `RWMutex` + `closed` flag.
- **Close has a deadline.** If Spanrail hangs, `Close` cancels the shared context so in-flight HTTP
  calls and backoff sleeps abort, and returns an error instead of blocking shutdown forever.

### What gets sent (see `report/events.go`)
New trace: `trace-create` (id == traceId), `generation-create`, `generation-update`.
Attached to an existing trace: only the two generation events. Metadata, usage and end time go on
the update only because the worker replaces `metadata` wholesale. Unknowns are omitted; `costDetails`
is never sent (no price table, so no invented cost).

### Interview questions
1. *Why drop instead of block when the queue is full?* The gateway sits on the critical path of a
   paying call. Observability must degrade before the product does; the drop is counted and visible.
2. *How do you avoid panicking on send-after-close?* Producers take an `RLock` and check `closed`;
   `Close` takes the write lock before closing the channel. Sending never happens on a closed channel.
3. *What is the difference between `/healthz` and `/readyz` during shutdown?* Alive vs should-receive-traffic.
4. *Why retry only some events from a 207?* Retrying accepted events is wasteful, and retrying
   rejected (invalid) ones can never succeed.
5. *How would you prove the retry logic?* Inject `Sleep` and `Rand`; assert the exact sleep sequence
   (100ms, 200ms) and the attempt count with a fake sender.

### Pieces to type yourself
`Reporter.Enqueue`, `Reporter.worker`, `Reporter.Close`, `backoff`, and the shutdown order in `main`.

## Milestone 5: trace linking and the end-to-end check

### Trace linking
- A caller sends `X-Spanrail-Trace-Id` (and optionally `X-Spanrail-Parent-Observation-Id`). The
  generation then attaches to that trace instead of creating a new root. Without the header the
  gateway sends `trace-create` first (in Spanrail a trace is its own root observation: id == traceId).
- The ids end up in JSON and in database keys, so they must match `^[A-Za-z0-9_.:-]{1,128}$`.
  An invalid value is **ignored, not rejected**: the LLM call must never fail because of our
  bookkeeping. A parent without a valid trace is dropped too.
- `X-Spanrail-*` headers are **removed before forwarding**, so the provider never sees them.

### What the review taught (and the bug that was mine)
An independent review of milestones 1-4 found real problems, now fixed with tests:
`ReverseProxy` panics with `http.ErrAbortHandler` when a client leaves mid-stream, which skipped our
recording (fix: recover, record, re-panic); `http.ServeMux` redirects odd paths (a proxy must not);
a long prompt can push `"model"` past the peek window (fallback: the response's model); the peek
read had no deadline; `/readyz` could never answer 503 because the listener closed first.
While fixing the stall test I lost time to my own mistake: a scripted `str.replace` matched nothing
and failed silently, so the fix was never in the file. The goroutine dump pointed at the exact line.
Lesson: assert that an edit applied, and debug from evidence (goroutine dump) rather than theory.

### Interview questions
1. *Why ignore a bad trace header instead of returning 400?* Observability must not break the call.
2. *Why recover and re-panic in the middleware?* ReverseProxy uses the panic to abort the connection;
   we need to observe the call but must not change that behaviour.
3. *Why not `ServeMux`?* It canonicalises paths and redirects, so the upstream would not receive what the client sent.
4. *Why leave the read deadline expired after a failed peek?* Otherwise net/http tries to drain the rest of the promised body from a silent client with no time limit.
5. *What does the E2E script prove that unit tests cannot?* That the real Spanrail schema, worker and
   Postgres accept what we send, and that the pieces agree on ids and field names.

### Pieces to type yourself
`traceLink` and the recover/record/re-panic block in `observe.Handler`, and `classify207` in `report/sender.go`.

## Milestone 6: packaging, benchmarks and the bug measurement found

### Docker
- **Multi-stage build.** Stage 1 (`golang:alpine`) compiles; stage 2 (`distroless/static:nonroot`) holds
  only the binary. `CGO_ENABLED=0` makes the binary static (no libc), so it runs on an image with no shell,
  no package manager and no curl. It runs as uid 65532, not root.
- **`go.mod` and `go.sum` are copied before the source** so Docker caches the dependency download
  until they change.
- **No curl for `HEALTHCHECK`**, so the binary has a `healthcheck` subcommand that GETs its own `/healthz`.
- **SIGTERM matters in containers.** `docker stop` sends SIGTERM, waits a grace period, then SIGKILL.
  Verified with a real container: with `FLUSH_INTERVAL=1h` (so only shutdown could deliver) 0 events had
  reached the sink before `docker stop` and all 30 had after. Gotcha found on the way: this machine's
  Docker has a **1 second** default stop timeout, so a plain `docker stop` killed the process mid-flush
  (exit 137). The compose file sets `stop_grace_period: 40s`.

### The benchmark found a real bug
The first benchmark run showed thousands of failed requests through the gateway at concurrency 32 and
none when calling the upstream directly. Hypothesis: Go's `DefaultTransport` keeps only **2** idle
connections per host. I proved it with a failing test first (58 upstream connections for 4 rounds of
16 concurrent requests, expected about 16), then set `MaxIdleConnsPerHost`. For a gateway this matters
twice: every extra connection is a TCP+TLS handshake added to a user's call, and under load it exhausts
local ports. No unit test had caught it because it only appears with concurrency.

### Interview questions
1. *Why distroless/scratch instead of alpine?* Smaller attack surface; nothing to exec into.
2. *Why `go mod download` as its own layer?* Build cache.
3. *What is the difference between `Idle` and `Active` connections in a Go transport and why does the per-host cap matter?*
   Idle ones are kept for reuse; the cap decides how many survive between bursts.
4. *How do you know your benchmark is trustworthy?* Zero errors, repeated runs shown unaltered, same
   machine/method for baseline and subject, and awareness of clock resolution and CPU contention.
5. *What happens to in-flight reports on `kill -9`?* Lost: the queue is in memory. That is a documented trade-off.

### Pieces to type yourself
The `Dockerfile`, the `MaxIdleConnsPerHost` block in `proxy.New` with its comment, and the shutdown
sequence in `main` (you will be asked to draw it).

## Review round 2: hardening (code review + security review)

Two independent reviews of the finished branch found no key leak, no SSRF and no header injection, but
real availability and deployment problems. Each was checked against the code first; three were not fixed
(documented instead: Anthropic/Responses usage shapes, slow-reader DoS, `HTTPS_PROXY` honoured).

### The ones worth being able to explain
- **Slowloris on the request body.** The first fix (`PEEK_TIMEOUT` as one deadline) was wrong: it killed a
  slow but progressing upload. The correct tool is a **stall guard**: set the read deadline to `now+timeout`
  *before every Read*, so it only fires when nothing arrives for that long. It also covers the body read
  *after* the peek, which the first version left unprotected.
- **A read deadline cancels the request context.** When a connection read times out, `net/http` cancels the
  request's context. `ReverseProxy` then reports `context.Canceled`, my error handler read that as "client went
  away", wrote nothing, and `net/http` sent a bare **200**. The stalled client got a success status. Fix: record
  the stall in a flag stored *on the context* (it survives cancellation) and check it first -> 408.
- **`Accept-Encoding: br`.** Browsers and Node offer Brotli; the gateway only reads gzip/identity, so usage
  would silently vanish for the most common real clients. The gateway now asks the provider for gzip *only if the
  client accepts gzip*, so the client can always decode what it receives.
- **Defaults that bite.** The prod compose overlay auto-started the gateway; with no project key (they only exist
  after the web app is running) it crash-looped. It is now opt-in everywhere, published on `127.0.0.1` only, with
  a read-only filesystem, no capabilities and `no-new-privileges`.
- **`govulncheck` reported 9 standard-library vulnerabilities** in the Go version I had installed (1.27.0), all
  fixed in 1.27.2. `go.mod` now requires 1.27.2, the Dockerfile pins it (its image sets `GOTOOLCHAIN=local`, so an
  older compiler fails loudly), and CI runs `govulncheck`. A scan of the final code reports none.
- **Don't let callers inflate what you send onward.** A caller chooses the request path; an enormous one went into
  two fields of every reported event, and a rejected batch loses *other* users' events. The reported path is capped.

### Milestone 7: showing the timing in the trace view
`src/lib/gatewayTiming.ts` is a pure function that turns `metadata.gateway.timingMs` into ordered phases (DNS,
connect, TLS, upstream wait, transfer) and is unit-tested (13 tests). `GatewayTiming.tsx` renders a one-hue bar
plus a table, and renders **nothing** for observations without gateway timing, so existing traces are unchanged.
Per the dataviz rules, colour is never the only carrier (every segment is also a table row with its value and
share) and a phase that did not happen is omitted, not shown as zero.

### Interview questions
1. *Why check the stall flag before `context.Canceled`?* Because the stall itself causes the cancellation.
2. *Why a deadline refreshed per Read instead of one absolute deadline?* Distinguishes slow from stalled.
3. *Why is a write deadline not used for slow readers?* A stale deadline would break the final flush of an
   idle SSE stream; mitigation belongs in the load balancer.
4. *What does `cap_drop: ALL` + `read_only` buy you for a static Go binary?* It cannot write anywhere or gain
   privileges even if an attacker finds a bug.
5. *Why is a vulnerability scanner part of CI for a service with no third-party code?* The standard library and
   toolchain are dependencies too; 9 findings were in `net/http` and `crypto/tls`.

### Pieces to type yourself
`stallGuard.Read`, `preferGzip`, and the order of checks in `proxy.errorHandler`.
