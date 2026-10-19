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
	"time"
)

// New returns a handler that forwards every request to upstream. The upstream is fixed
// configuration: nothing in the incoming request can redirect where traffic goes.
//
// headerTimeout bounds how long we wait for the upstream to start responding. It does
// not bound the body, so long streaming (SSE) responses are not cut off.
func New(upstream *url.URL, headerTimeout time.Duration) http.Handler {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = headerTimeout

	return &httputil.ReverseProxy{
		// Rewrite (not the older Director) gives us a fresh outbound request and strips
		// hop-by-hop headers and client-supplied X-Forwarded-* before our code runs.
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(upstream) // joins upstream path prefix, sets Host to upstream's
			pr.SetXForwarded()
		},
		Transport: transport,
		// A negative interval flushes after every write, so SSE chunks reach the client
		// as the upstream produces them instead of waiting for a buffer to fill.
		FlushInterval: -1,
		ErrorHandler:  errorHandler,
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
