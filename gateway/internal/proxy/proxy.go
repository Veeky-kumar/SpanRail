// Package proxy is the reverse proxy that forwards client requests to the configured
// upstream LLM API.
package proxy

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/nettrace"
)

// maxIdleConnsPerHost bounds the keep-alive pool to the (single) upstream host.
const maxIdleConnsPerHost = 256

// New returns a handler that forwards every request to upstream. The upstream is fixed
// configuration: nothing in the incoming request can redirect where traffic goes.
//
// headerTimeout bounds how long we wait for the upstream to start responding. It does
// not bound the body, so long streaming (SSE) responses are not cut off.
func New(upstream *url.URL, headerTimeout time.Duration) http.Handler {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = headerTimeout
	// http.DefaultTransport keeps only 2 idle connections per host. A gateway talks to one
	// upstream host on behalf of many callers, so with more than 2 concurrent requests it
	// would keep closing and reopening connections, paying a TCP (and TLS) handshake on most
	// calls and, under load, running out of local ports. Keep a pool sized for real concurrency.
	transport.MaxIdleConns = 0 // no global cap; the per-host cap below is what matters
	transport.MaxIdleConnsPerHost = maxIdleConnsPerHost

	return &httputil.ReverseProxy{
		// Rewrite (not the older Director) gives us a fresh outbound request and strips
		// hop-by-hop headers and client-supplied X-Forwarded-* before our code runs.
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(upstream) // joins upstream path prefix, sets Host to upstream's
			pr.SetXForwarded()
			stripControlHeaders(pr.Out.Header)
		},
		Transport: nettrace.Transport(transport), // records DNS/connect/TLS/TTFB when the request carries a Timings
		// A negative interval flushes after every write, so SSE chunks reach the client
		// as the upstream produces them instead of waiting for a buffer to fill.
		FlushInterval: -1,
		ErrorHandler:  errorHandler,
	}
}

// ControlHeaderPrefix marks headers meant for the gateway itself (trace linking). They are
// removed before forwarding so the LLM provider never sees them.
const ControlHeaderPrefix = "x-tracewell-"

func stripControlHeaders(h http.Header) {
	for name := range h {
		if strings.HasPrefix(strings.ToLower(name), ControlHeaderPrefix) {
			delete(h, name)
		}
	}
}

func errorHandler(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, context.Canceled) {
		return // client went away; nobody left to answer
	}
	var ne net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()) {
		log.Printf("upstream timeout: %s %s: %v", r.Method, r.URL.Path, err)
		http.Error(w, "upstream timed out", http.StatusGatewayTimeout)
		return
	}
	log.Printf("upstream error: %s %s: %v", r.Method, r.URL.Path, err)
	http.Error(w, "bad gateway", http.StatusBadGateway)
}
