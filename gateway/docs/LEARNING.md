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
