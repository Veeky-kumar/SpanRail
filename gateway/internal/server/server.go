// Package server wires the gateway's own endpoints around the proxy handler.
package server

import (
	"net/http"
	"time"
)

// Ops are the operational endpoints served next to the proxy.
type Ops struct {
	Metrics http.Handler // GET /metrics
	Ready   func() bool  // GET /readyz; false while shutting down
}

// Handler serves GET /healthz, /readyz and /metrics itself and sends everything else to
// proxied, untouched.
//
// It deliberately does not use http.ServeMux: a mux cleans paths and redirects (301) requests
// containing "//" or "..", and answers 405 for other methods on its routes. A transparent
// proxy must pass those through to the upstream exactly as received.
//
// /healthz answers "is the process alive" and is always 200. /readyz answers "should
// traffic be sent here" and turns 503 while draining, so a load balancer stops routing
// to us without an orchestrator concluding the process is broken and killing it.
func Handler(proxied http.Handler, ops Ops) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			switch r.URL.Path {
			case "/healthz":
				_, _ = w.Write([]byte("ok"))
				return
			case "/readyz":
				if ops.Ready != nil && !ops.Ready() {
					http.Error(w, "shutting down", http.StatusServiceUnavailable)
					return
				}
				_, _ = w.Write([]byte("ready"))
				return
			case "/metrics":
				if ops.Metrics != nil {
					ops.Metrics.ServeHTTP(w, r)
					return
				}
			}
		}
		proxied.ServeHTTP(w, r)
	})
}

// New returns an http.Server with timeouts that protect against slow clients.
//
// There is deliberately no ReadTimeout or WriteTimeout: they would cap the whole exchange
// and cut off long streaming responses. ReadHeaderTimeout stops slowloris-style clients that
// trickle headers; IdleTimeout reclaims idle keep-alive connections.
func New(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}
