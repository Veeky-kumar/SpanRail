# Results

Everything here was measured or observed in this repository's development. Nothing is estimated.
Raw outputs are committed next to this file: [docs/bench-output.txt](./docs/bench-output.txt) and
[docs/e2e-evidence.txt](./docs/e2e-evidence.txt). If you reuse a number on a resume, use the wording
in the "What I can claim" section at the bottom.

## Test machine and method

| | |
|---|---|
| Machine | AMD Ryzen 7 250 (8 cores / 16 threads), 31.3 GB RAM, Windows 11 Home 10.0.26200, "Balanced" power plan |
| Toolchain | Go **1.27.2** windows/amd64 for the final tests, E2E and benchmark (development started on 1.27.0, see "Problems found"), Docker Desktop (engine 29.4.1) |
| Topology | everything on one machine over loopback: load generator, gateway, fake upstream and fake Tracewell compete for the same CPUs |
| Load generator | `cmd/bench`: closed loop, keep-alive client, 500 unmeasured warm-up requests, then `n` measured requests |
| Repetitions | 3 runs per configuration, every run committed unaltered. Tables below show the **median of the 3** |
| Clock | **Go's clock on this machine steps in ~0.54 ms** (199,998 of 200,000 consecutive `time.Now()` reads were identical). Sub-millisecond percentiles here are quantised; this is why a second pass uses a 20 ms upstream |

## Tests and static checks

* Go: `go test -race -count=1 ./...` -> **167 passing (108 top-level tests + 59 subtests), 0 failing**, 13 packages.
* Node (the existing app plus the new dashboard logic): `vitest run` -> **50 passing** (37 existing + 13 new for the timing parser).
* `gofmt -l` and `go vet ./...` print nothing. `govulncheck ./...` on Go 1.27.2: **no vulnerabilities**.
* About 2,590 lines of Go source and 3,090 lines of Go test code.
* Statement coverage: server 97%, report 96%, redact 100%, nettrace 100%, fakes 94-97%, config 93%,
  proxy 90%, capture 89%, observe 89%, ids 83%, metrics 54% (mostly thin registration code).
  `cmd/*` is not unit-tested; it is covered by the E2E script and the container test.
* Concurrency-sensitive tests were each run repeatedly under `-race` (reporter 25x, observe/nettrace 15x, the
  stall tests 20x) without a failure.
* Two mutation checks proved tests are real: breaking `Flush()` made the SSE test fail with "stream is
  buffered"; and the connection-pool test failed (58 connections vs ~16) before the fix.
* The dashboard component (`GatewayTiming.tsx`) is type-checked and its logic unit-tested, but **never rendered
  in a browser** (see "Not verified").

## Overhead the gateway adds

Same requests, same machine, sent (a) directly to a fake OpenAI-compatible upstream, (b) through the
gateway with reporting off, (c) through the gateway reporting to a fast fake Tracewell.
**0 errors in all 36 runs.**

### With a 20 ms upstream (overhead is far above the clock resolution)

| Concurrency | Config | p50 | p95 | p99 | mean | req/s |
|---|---|---|---|---|---|---|
| 1 | direct | 20.91 ms | 22.02 ms | 24.13 ms | 21.06 ms | 47 |
| 1 | gateway, no reporting | 21.36 ms (**+0.45**) | 22.69 ms (**+0.67**) | 25.97 ms | 21.55 ms | 46 |
| 1 | gateway, reporting | 21.36 ms (+0.45) | 22.79 ms (+0.77) | 25.94 ms | 21.59 ms | 46 |
| 32 | direct | 20.58 ms | 22.07 ms | 24.31 ms | 20.84 ms | 1,534 |
| 32 | gateway, no reporting | 21.17 ms (**+0.58**) | 22.90 ms (**+0.83**) | 25.33 ms | 21.36 ms | 1,496 |
| 32 | gateway, reporting | 21.16 ms (+0.57) | 23.17 ms (+1.10) | 25.85 ms | 21.42 ms | 1,492 |

Reading: with a realistic upstream latency the gateway adds roughly **0.45-0.6 ms at p50 and 0.7-1.1 ms at
p95**, with throughput within 3% of direct. Differences below about 0.5 ms are within one clock step.

### With an instant (0 ms) upstream (worst case for relative cost, and throughput)

| Concurrency | Config | mean | p95 | req/s |
|---|---|---|---|---|
| 1 | direct | 0.18 ms | 0.56 ms | 5,298 |
| 1 | gateway, no reporting | 0.46 ms | 0.71 ms | 2,166 |
| 1 | gateway, reporting | 0.47 ms | 0.68 ms | 2,110 |
| 32 | direct | 1.04 ms | 2.69 ms | 27,941 |
| 32 | gateway, no reporting | 3.03 ms | 6.02 ms | 10,351 |
| 32 | gateway, reporting | 2.28 ms | 4.53 ms | 13,464 |

At c=1 the mean overhead is about **0.27 ms** (p50 is not readable at this clock resolution). When the
upstream costs nothing, the gateway is the bottleneck: it sustains ~10-13k requests/s against ~28k for
direct calls on this machine, with the load generator sharing the CPU. A real LLM call takes hundreds of
milliseconds to seconds, so this regime shows the ceiling, not production behaviour.

**An unexplained result, stated rather than hidden.** At c=32 with a 0 ms upstream the configuration
with reporting *on* is consistently faster (13.5k req/s) than with reporting *off* (10.4k req/s). During
development, 4 interleaved A/B rounds and a further 3 rounds all agreed, so it is not noise or run order, and
the final benchmark shows the same. I tested the obvious explanation (reading the request body prefix up front
changes how the body is written upstream) by shrinking the peek to 1 byte; throughput stayed at ~12.5k, so that
hypothesis is **refuted**, and I did not find the cause. Consequence: the "no reporting" row is not a clean
"plain proxy" baseline, and the conservative overhead figures above are the *no-reporting* ones (the larger).

## Event throughput

* Gateway to a fast fake Tracewell, c=32, 0 ms upstream: **~13.5k calls/s sustained, which is ~40k events/s**
  (3 events per call) delivered in batches. Over the whole benchmark 369,000 events were sent for 123,000
  calls: **0 dropped, 0 flush failures**, and the sink received exactly 123,000 of each event type.
  (This used `QUEUE_SIZE=100000`; the default is 1000.)
* **Real Tracewell is the bottleneck, and the gateway behaved as designed.** 3,000 calls at c=16 against the
  real Tracewell (Next.js dev server + worker + Postgres + Redis, default `QUEUE_SIZE=1000`), measured twice
  (before and after the review fixes) with identical results:
  * 0 client-visible errors; call latency stayed at p50 1.83 ms / p95 3.97 ms (not slowed by Tracewell's lag).
  * 1,034 calls were delivered and **1,966 were dropped and counted** (`report_dropped_total=1966`).
  * Tracewell stored exactly **1,034** generations: delivered + dropped = 3,000, so accounting is exact.
  * Takeaway: with default settings the real Tracewell sustains far fewer events per second than the
    gateway can produce; raise `QUEUE_SIZE` for bursts, but a sustained rate above Tracewell's ingest
    capacity will drop events. (The dev server is not a tuned deployment.)

## End-to-end against a real Tracewell stack

`scripts/e2e.sh` against Postgres + Redis (Docker), the Next.js app and the ingestion worker, using a fake
OpenAI-compatible upstream (no paid API key). **15 of 15 assertions passed on the final build**
(see [docs/e2e-evidence.txt](./docs/e2e-evidence.txt)):

* 6 calls became 6 stored `GENERATION` rows, correctly linked under a new root trace.
* One call sent with `X-Tracewell-Trace-Id` attached to an existing trace (no new root created).
* Token usage stored for a normal call (input 11 / output 7 / total 18) and for a stream that asked for usage;
  **unknown (null) for a stream that did not**: not invented.
* Upstream HTTP 500 stored as level `ERROR` with a status message.
* `Authorization` stored as `[REDACTED]`; the provider key appears in **no** `Observation` or `IngestEvent` row.
* No ingestion errors.
* Network timing, from a manual run on a fresh connection (upstream `localhost`, 40 ms latency; an earlier build):
  `dns 47.391 ms, connect 0.528 ms, ttfb 89.041 ms, total 89.59 ms` (TTFB ≈ dns + connect + the 40 ms upstream
  delay). The next call reused the connection and stored only `ttfb 41.209 ms`: no dns/connect/tls, as designed.
  TLS time was not part of this run (plain-HTTP upstream); it is covered by a unit test against a TLS server.
* The dashboard's trace page, fetched over authenticated HTTP (an earlier build), contained the stored
  `timingMs` metadata. **No page was looked at in a browser** (the browser extension was not connected).

## Container

| | |
|---|---|
| Image | multi-stage, `distroless/static:nonroot`, static binary, runs as uid 65532, Go 1.27.2 build stage |
| Size | 4,998,051 bytes of image content (`docker image inspect`); `docker images` reports 21 MB disk usage |
| Hardening tested | ran with `--read-only --cap-drop ALL --security-opt no-new-privileges`: healthy, works |
| Health | `HEALTHCHECK` via `gateway healthcheck` (follows `OPS_ADDR`); observed `healthy` |
| Ops port | with `OPS_ADDR=:9090`, `/healthz` `/readyz` `/metrics` answered there; on the public port `/healthz` and `/metrics` were proxied to the upstream (404 from it), i.e. not served or shadowed |
| Graceful shutdown (real SIGTERM) | with `FLUSH_INTERVAL=1h` so only shutdown can deliver: **0 events at the sink before `docker stop`, 30 after** (10 calls x 3 events); exit code 0 in 2.0 s. Verified on the hardened container and, earlier, on the plain one |
| Docker's own stop timeout | this machine's Docker Desktop defaults to a **1 s** stop timeout (an unrelated postgres container showed the same): a bare `docker stop` SIGKILLed the gateway mid-flush (exit 137). With `-t 40` it exited 0 and logged the events it could not deliver. The compose file sets `stop_grace_period: 40s` |
| Compose | the default dev stack still starts only postgres and redis; the production overlay's default services are exactly postgres, redis, web, worker as before (the gateway is opt-in via `--profile gateway`); `web`/`worker` differ from `main` only in the checkout's build-context path |

## Problems found by testing, review and measurement (all fixed unless noted, each with a test)

1. A first independent code review (milestones 1-4): calls whose response copy aborts (client leaves mid-stream)
   were never recorded; `ServeMux` redirected unusual paths; `model` was lost for very long prompts; the request
   prefix read had no timeout; `/readyz` could never serve a 503; unparseable responses were buffered; 207 errors
   matching no event were counted as accepted.
2. **Benchmarking found a connection-pool bug**: the proxy kept only 2 idle upstream connections (Go's default),
   so under concurrency it opened 58 connections for work that needs ~16 and, on this machine, failed thousands
   of requests.
3. A scripted edit of mine silently did not apply; the stall test caught it and a goroutine dump located it.
4. A second code review of the finished branch and an independent **security review** (no High findings; no key
   leak, SSRF or header injection) found, and I fixed: clients sending `Accept-Encoding: br` lost usage;
   `PEEK_TIMEOUT` killed slow uploads and nothing guarded the body after the peek; a stalled client got an empty
   200 (a read-deadline cancels the request context, hiding the cause); the caller-chosen path was copied
   unbounded into every event; the prod compose overlay auto-started a gateway that crash-loops without keys and
   it was published on all interfaces; 408/425 from Tracewell were treated as permanent; header redaction was a
   plain list; size caps were up to 1 GiB; client IPs were forwarded to the provider; WebSocket upgrades were
   recorded as status 499; the ops endpoints shared the public port (now optional `OPS_ADDR`).
5. **`govulncheck` found 9 standard-library vulnerabilities in Go 1.27.0** (all fixed in 1.27.2), the version
   first installed. `go.mod`, the Dockerfile and CI now require 1.27.2; the scan of the final code is clean.
   Everything measured above ran on 1.27.2, except the earlier manual timing run.
6. **Found but not fixed** (documented in the README): Anthropic and OpenAI-Responses streaming usage shapes are
   not parsed; a client that reads a response very slowly can hold a connection (no write timeout, because it
   would cut idle streams); `HTTPS_PROXY` in the environment is honoured; no per-connection limit; base images and
   GitHub Actions are tag-pinned, not digest/SHA-pinned; duplicate `"model"` keys take the first.

## Not verified

* The GitHub Actions workflow (`.github/workflows/gateway.yml`) has **never run**; it was only written.
  The same commands were run locally, but not on a GitHub runner.
* **The dashboard timing breakdown was never viewed in a browser.** Its logic is unit-tested and the component
  type-checks, but its appearance (spacing, dark mode, the bar) is unchecked.
* Timing against a real HTTPS provider and HTTP/2; TLS timing only against a local `httptest` TLS server.
* Linux/macOS native runs. The Docker image runs Linux but was only exercised on this Windows host.
* Anthropic or OpenAI Responses streaming usage (not parsed; see README limitations).
* Behaviour with very large bodies or thousands of concurrent connections.

## What I can claim (resume-safe wording)

* "Built a Go reverse proxy (stdlib `net/http`, `httputil.ReverseProxy`, `httptrace`) that records LLM calls
  to an observability platform, including DNS, TCP, TLS and time-to-first-byte timings."
* "167 automated Go tests passing under the race detector, plus a scripted end-to-end check (15 assertions)
  against the real stack."
* "Measured about 0.5 ms added latency at p50 and 0.7-1.1 ms at p95 against a 20 ms upstream (single
  Windows machine, loopback, 3 runs per case)."
* "Found a connection-pooling defect through load testing (58 vs ~16 upstream connections) and fixed it test-first."
* "Acted on an independent code review and security review, and added `govulncheck` after it found 9
  standard-library vulnerabilities in the installed Go toolchain."
* "Verified graceful shutdown in a hardened container (read-only, no capabilities): all queued events flushed on SIGTERM."

Do **not** claim: production throughput, cost tracking, Anthropic support, that CI is running, or that the
dashboard UI has been visually verified.
