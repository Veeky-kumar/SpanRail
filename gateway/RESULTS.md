# Results

Everything here was measured or observed in this repository's development. Nothing is estimated.
Raw outputs are committed next to this file: [docs/bench-output.txt](./docs/bench-output.txt) and
[docs/e2e-evidence.txt](./docs/e2e-evidence.txt). If you reuse a number on a resume, use the wording
in the "What I can claim" section at the bottom.

## Test machine and method

| | |
|---|---|
| Machine | AMD Ryzen 7 250 (8 cores / 16 threads), 31.3 GB RAM, Windows 11 Home 10.0.26200, "Balanced" power plan |
| Toolchain | Go 1.27.0 windows/amd64, Docker Desktop (engine 29.4.1) |
| Topology | everything on one machine over loopback: load generator, gateway, fake upstream and fake Tracewell compete for the same CPUs |
| Load generator | `cmd/bench`: closed loop, keep-alive client, 500 unmeasured warm-up requests, then `n` measured requests |
| Repetitions | 3 runs per configuration, every run committed unaltered. Tables below show the **median of the 3** |
| Clock | **Go's clock on this machine steps in ~0.54 ms** (199,998 of 200,000 consecutive `time.Now()` reads were identical). Sub-millisecond percentiles here are quantised; this is why a second pass uses a 20 ms upstream |

## Tests

* `go test -race -count=1 ./...`: **151 passing (96 top-level tests + 55 subtests), 0 failing**, 13 packages.
* `gofmt -l` and `go vet ./...` print nothing.
* About 2,370 lines of source and 2,810 lines of test code (test code is slightly larger than source).
* Statement coverage: capture 96%, report 97%, proxy 97%, server 97%, config 93%, observe 89%,
  nettrace 100%, redact 100%, metrics 58% (the rest of metrics is thin registration code).
  `cmd/*` is not unit-tested (covered by the E2E script and the container test below).
* Concurrency-sensitive tests (reporter, observe, integration) were each run repeatedly under `-race`
  (25x for the reporter, 15x for observe/nettrace) without a failure.
* A mutation check proved the streaming test is real: breaking `Flush()` on purpose made
  `TestSSEIsNotBuffered...` fail with "stream is buffered".

## Overhead the gateway adds

Same requests, same machine, sent (a) directly to a fake OpenAI-compatible upstream, (b) through the
gateway with reporting off, (c) through the gateway reporting to a fast fake Tracewell.
**0 errors in all 36 runs.**

### With a 20 ms upstream (overhead is far above the clock resolution)

| Concurrency | Config | p50 | p95 | p99 | mean | req/s |
|---|---|---|---|---|---|---|
| 1 | direct | 20.86 ms | 21.95 ms | 26.57 ms | 21.14 ms | 47 |
| 1 | gateway, no reporting | 21.34 ms (**+0.48**) | 22.75 ms (**+0.80**) | 28.23 ms | 21.66 ms | 46 |
| 1 | gateway, reporting | 21.37 ms (+0.51) | 22.95 ms (+1.00) | 27.64 ms | 21.63 ms | 46 |
| 32 | direct | 20.54 ms | 21.66 ms | 23.20 ms | 20.68 ms | 1,545 |
| 32 | gateway, no reporting | 21.04 ms (**+0.50**) | 22.41 ms (**+0.75**) | 23.78 ms | 21.20 ms | 1,508 |
| 32 | gateway, reporting | 21.15 ms (+0.62) | 23.13 ms (+1.47) | 27.88 ms | 21.42 ms | 1,492 |

Reading: with a realistic upstream latency the gateway adds roughly **0.5 ms at p50 and 0.75-1.5 ms at
p95**. Differences below about 0.5 ms are within one clock step. p99 differences are noisy (the direct
baseline p99 itself moved between 22.8 and 30.5 ms across runs).

### With an instant (0 ms) upstream (worst case for relative cost, and throughput)

| Concurrency | Config | mean | p95 | req/s |
|---|---|---|---|---|
| 1 | direct | 0.19 ms | 0.56 ms | 5,214 |
| 1 | gateway, no reporting | 0.50 ms | 0.78 ms | 1,973 |
| 1 | gateway, reporting | 0.51 ms | 0.75 ms | 1,950 |
| 32 | direct | 1.06 ms | 2.64 ms | 27,647 |
| 32 | gateway, no reporting | 3.13 ms | 6.16 ms | 10,040 |
| 32 | gateway, reporting | 2.25 ms | 4.43 ms | 13,354 |

At c=1 the mean overhead is about **0.31 ms** (p50 is not readable at this clock resolution). When the
upstream costs nothing, the gateway is the bottleneck: it sustains ~10-13k requests/s against ~28k for
direct calls on this machine, with the load generator sharing the CPU. A real LLM call takes hundreds of
milliseconds to seconds, so this regime is not representative of production; it only shows the ceiling.

**An unexplained result, stated rather than hidden.** At c=32 with a 0 ms upstream the configuration
with reporting *on* was consistently faster (12-14k req/s) than with reporting *off* (9.5-10.5k req/s):
4 interleaved A/B rounds and a further 3 rounds all agreed, so it is not noise or run order. I tested the
obvious explanation (reading the request body prefix up front changes how the body is written upstream)
by shrinking the peek to 1 byte; throughput stayed at ~12.5k, so that hypothesis is **refuted**, and I did
not find the cause. Consequence: the "no reporting" row is not a clean "plain proxy" baseline, and the
conservative overhead figures above are the *no-reporting* ones (the larger).

## Event throughput

* Gateway to a fast fake Tracewell, c=32, 0 ms upstream: **~13.4k calls/s sustained, which is ~40k events/s**
  (3 events per call) delivered in batches. Over the whole benchmark 369,000 events were sent for 123,000
  calls: **0 dropped, 0 flush failures**, and the sink received exactly 123,000 of each event type.
  (This used `QUEUE_SIZE=100000`; the default is 1000.)
* **Real Tracewell is the bottleneck, and the gateway behaved as designed.** 3,000 calls at c=16 against the
  real Tracewell (Next.js dev server + worker + Postgres + Redis, default `QUEUE_SIZE=1000`):
  * 0 client-visible errors; call latency stayed at p50 1.85 ms / p95 3.83 ms (not slowed by Tracewell's lag).
  * 1,034 calls were delivered and **1,966 were dropped and counted** (`report_dropped_total=1966`).
  * Tracewell stored exactly **1,034** generations: delivered + dropped = 3,000, so accounting is exact.
  * Takeaway: with default settings the real Tracewell sustains far fewer events per second than the
    gateway can produce; raise `QUEUE_SIZE` for bursts, but a sustained rate above Tracewell's ingest
    capacity will drop events. (The dev server is not a tuned deployment.)

## End-to-end against a real Tracewell stack

`scripts/e2e.sh` against Postgres + Redis (Docker), the Next.js app and the ingestion worker, using a fake
OpenAI-compatible upstream (no paid API key). **15 of 15 assertions passed** (see
[docs/e2e-evidence.txt](./docs/e2e-evidence.txt)):

* 6 calls became 6 stored `GENERATION` rows, correctly linked under a new root trace.
* One call sent with `X-Tracewell-Trace-Id` attached to an existing trace (no new root created).
* Token usage stored for a normal call (input 11 / output 7 / total 18) and for a stream that asked for usage;
  **unknown (null) for a stream that did not**: not invented.
* Upstream HTTP 500 stored as level `ERROR` with a status message.
* `Authorization` stored as `[REDACTED]`; the provider key appears in **no** `Observation` or `IngestEvent` row.
* No ingestion errors.
* Network timing, from a manual run on a fresh connection (upstream `localhost`, 40 ms latency):
  `dns 47.391 ms, connect 0.528 ms, ttfb 89.041 ms, total 89.59 ms` (TTFB ≈ dns + connect + the 40 ms upstream
  delay). The next call reused the connection and stored only `ttfb 41.209 ms`: no dns/connect/tls, as designed.
  TLS time was not part of this run (plain-HTTP upstream); it is covered by a unit test against a TLS server.
* The dashboard's trace page, fetched over authenticated HTTP, contained the stored `timingMs` metadata.
  **I did not look at it in a browser** (the browser extension was not connected), so the visual rendering is unverified.

## Container

| | |
|---|---|
| Image | multi-stage, `distroless/static:nonroot`, static binary, runs as uid 65532 |
| Size | 4,994,837 bytes of image content (`docker image inspect`); `docker images` reports 21 MB disk usage |
| Health | `HEALTHCHECK` via `gateway healthcheck`; observed `healthy` |
| Graceful shutdown (real SIGTERM) | with `FLUSH_INTERVAL=1h` so only shutdown can deliver: **0 events at the sink before `docker stop`, 30 after** (10 calls x 3 events); exit code 0 |
| Readiness while draining | `/readyz` returned 200, then 503 during the `DRAIN_DELAY` window |
| Docker's own stop timeout | this machine's Docker Desktop defaults to a **1 s** stop timeout (an unrelated postgres container showed the same): a bare `docker stop` SIGKILLed the gateway mid-flush (exit 137). With `-t 40` it exited 0 in 3.7 s and logged the events it could not deliver. The compose file sets `stop_grace_period: 40s` |
| Compose | `web` and `worker` services render identically before and after (the only diff is the build-context path of the checkout); the default dev stack still starts only postgres and redis |

## Problems found by testing, review and measurement (all fixed, each with a test)

1. An independent code review of the first four milestones found: calls whose response copy aborts
   (client leaves mid-stream) were never recorded; `ServeMux` redirected unusual paths; `model` was lost
   for very long prompts; the request-prefix read had no timeout; `/readyz` could never serve a 503;
   unparseable responses were buffered; 207 errors matching no event were counted as accepted.
2. **Benchmarking found a connection-pool bug**: the proxy kept only 2 idle upstream connections
   (Go's default), so under concurrency it opened 58 connections for work that needs ~16 and, on this
   machine, failed thousands of requests. Fixed and covered by `TestUpstreamConnectionsAreReusedUnderConcurrency`.
3. A scripted edit of mine silently did not apply; the stall test caught it and a goroutine dump
   located it. Lesson recorded in `docs/LEARNING.md`.

## Not verified

* The GitHub Actions workflow (`.github/workflows/gateway.yml`) has **never run**; it was only written.
  The same commands were run locally, but not on a GitHub runner.
* Timing against a real HTTPS provider and HTTP/2; TLS timing only against a local `httptest` TLS server.
* Linux/macOS native runs. The Docker image runs Linux but was only exercised on this Windows host.
* Anthropic or OpenAI Responses streaming usage (not parsed; see README limitations).
* Behaviour with very large bodies or thousands of concurrent connections.
* The security review of the final diff: see the end of this file for its status.

## What I can claim (resume-safe wording)

* "Built a Go reverse proxy (stdlib `net/http`, `httputil.ReverseProxy`, `httptrace`) that records LLM calls
  to an observability platform, including DNS, TCP, TLS and time-to-first-byte timings."
* "151 automated tests passing under the race detector; verified end to end against the real stack."
* "Measured about 0.5 ms added latency at p50 and 0.75-1.5 ms at p95 against a 20 ms upstream (single
  Windows machine, loopback, 3 runs per case)."
* "Found and fixed a connection-pooling defect via load testing (58 vs ~16 upstream connections)."
* "Verified graceful shutdown in a container: all queued events flushed on SIGTERM."

Do **not** claim: production throughput, cost tracking, Anthropic support, or that CI is running.
