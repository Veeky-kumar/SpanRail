// Package server wires the gateway's own endpoints around the proxy handler.
package server

import (
	"crypto/tls"
	"fmt"
	"net"
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

// Probe checks the gateway's own /healthz on the loopback interface. It backs the
// `gateway healthcheck` subcommand, because the minimal runtime image has no curl or shell.
// addr is the gateway's LISTEN_ADDR (":8080" or "host:port"). The probe only ever dials
// 127.0.0.1, so certificate verification is skipped for the TLS case: the cert is issued for
// the public name, not for loopback, and nothing sensitive is sent.
func Probe(addr string, useTLS bool) error {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("bad listen address %q: %w", addr, err)
	}
	scheme := "http"
	client := &http.Client{Timeout: 3 * time.Second}
	if useTLS {
		scheme = "https"
		client.Transport = &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}} //nolint:gosec // loopback self-probe, see above
	}
	resp, err := client.Get(scheme + "://" + net.JoinHostPort("127.0.0.1", port) + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz returned %d", resp.StatusCode)
	}
	return nil
}
