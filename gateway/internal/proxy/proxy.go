// Package proxy is the reverse proxy that forwards client requests to the configured
// upstream LLM API.
package proxy

import (
	"context"
	"errors"
	"github.com/veeky-ai/tracewell-gateway/internal/capture"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
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

	rp := &httputil.ReverseProxy{
		// Rewrite (not the older Director) gives us a fresh outbound request and strips
		// hop-by-hop headers and client-supplied X-Forwarded-* before our code runs. We do not
		// call SetXForwarded: the provider has no need for the caller's IP or the gateway's host.
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(upstream) // joins upstream path prefix, sets Host to upstream's
			stripControlHeaders(pr.Out.Header)
			preferGzip(pr.Out.Header)
		},
		Transport: nettrace.Transport(transport), // records DNS/connect/TLS/TTFB when the request carries a Timings
		// A negative interval flushes after every write, so SSE chunks reach the client
		// as the upstream produces them instead of waiting for a buffer to fill.
		FlushInterval: -1,
		ErrorHandler:  errorHandler,
	}

	// SetURL joins paths without cleaning them, so with an upstream like https://host/api a
	// request for "/../admin" would leave the prefix. Without a prefix there is nothing to
	// escape and the proxy stays fully transparent.
	if strings.Trim(upstream.Path, "/") == "" {
		return rp
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, seg := range strings.Split(r.URL.Path, "/") {
			if seg == ".." {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
		}
		rp.ServeHTTP(w, r)
	})
}

// preferGzip asks the provider for gzip when the client accepts it. Clients such as browsers
// and Node offer br and zstd too, but the gateway can only read token usage from identity or
// gzip bodies, so a br response would silently lose its usage. The client advertised gzip, so
// it can decode what it gets. A client that does not accept gzip is left untouched.
func preferGzip(h http.Header) {
	vals := h.Values("Accept-Encoding")
	if len(vals) == 0 {
		return
	}
	for _, v := range vals {
		for _, tok := range strings.Split(v, ",") {
			name, params, _ := strings.Cut(strings.TrimSpace(tok), ";")
			if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
				continue
			}
			if q := strings.ReplaceAll(strings.ToLower(params), " ", ""); q == "q=0" || q == "q=0.0" || q == "q=0.00" || q == "q=0.000" {
				continue // gzip explicitly refused
			}
			h.Set("Accept-Encoding", "gzip")
			return
		}
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
	// Checked before the cancellation below: a stalled client also cancels the request context.
	if capture.Stalled(r.Context()) {
		log.Printf("client stalled sending body: %s %q", r.Method, r.URL.Path)
		http.Error(w, "request body timed out", http.StatusRequestTimeout)
		return
	}
	if errors.Is(err, context.Canceled) {
		return // client went away; nobody left to answer
	}
	// A failure reading the client's own body is the client's problem, not an upstream outage.
	var cb *capture.ClientBodyError
	if errors.As(err, &cb) {
		log.Printf("client body error: %s %q: %v", r.Method, r.URL.Path, cb.Err)
		if errors.Is(cb.Err, os.ErrDeadlineExceeded) {
			http.Error(w, "request body timed out", http.StatusRequestTimeout)
		} else {
			http.Error(w, "could not read request body", http.StatusBadRequest)
		}
		return
	}
	var ne net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()) {
		log.Printf("upstream timeout: %s %q: %v", r.Method, r.URL.Path, err)
		http.Error(w, "upstream timed out", http.StatusGatewayTimeout)
		return
	}
	log.Printf("upstream error: %s %q: %v", r.Method, r.URL.Path, err)
	http.Error(w, "bad gateway", http.StatusBadGateway)
}
