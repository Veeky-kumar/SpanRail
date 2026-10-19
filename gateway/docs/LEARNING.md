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
