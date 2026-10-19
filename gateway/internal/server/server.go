// Package server wires the gateway's own endpoints around the proxy handler.
package server

import "net/http"

// Ops are the operational endpoints served next to the proxy.
type Ops struct {
	Metrics http.Handler // GET /metrics
	Ready   func() bool  // GET /readyz; false while shutting down
}

// Handler serves /healthz, /readyz and /metrics itself and sends everything else to proxied.
//
// /healthz answers "is the process alive" and is always 200. /readyz answers "should
// traffic be sent here" and turns 503 while draining, so a load balancer stops routing
// to us without an orchestrator concluding the process is broken and killing it.
func Handler(proxied http.Handler, ops Ops) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if ops.Ready != nil && !ops.Ready() {
			http.Error(w, "shutting down", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("ready"))
	})
	if ops.Metrics != nil {
		mux.Handle("GET /metrics", ops.Metrics)
	}
	mux.Handle("/", proxied)
	return mux
}
