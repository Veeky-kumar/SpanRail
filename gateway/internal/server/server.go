// Package server wires the gateway's own endpoints around the proxy handler.
package server

import "net/http"

// Handler serves the gateway's operational endpoints and sends everything else to proxied.
func Handler(proxied http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/", proxied)
	return mux
}
