// Package nettrace measures where the time goes when the gateway calls the upstream:
// DNS lookup, TCP connect, TLS handshake and time to first byte.
//
// It uses net/http/httptrace: the standard library calls the hooks below at fixed points
// of a request's life, and each hook just records a timestamp. A phase is reported only
// if it actually happened. A reused keep-alive connection has no DNS, connect or TLS
// phase, and reporting 0 for them would be a made-up measurement, so they stay nil.
package nettrace

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptrace"
	"sync"
	"time"
)

// Snapshot is the measured result for one request. A nil phase was not measured.
type Snapshot struct {
	DNS     *time.Duration // name lookup
	Connect *time.Duration // TCP connect of the winning attempt
	TLS     *time.Duration // TLS handshake
	// TTFB is the time from the start of the round trip (before any DNS/connect/TLS)
	// until the first byte of the upstream response arrived. It therefore includes the
	// setup phases above plus the upstream's own processing time.
	TTFB       *time.Duration
	ConnReused bool
}

// Timings collects trace events for one request. Hooks run on several goroutines (the
// dialer runs on its own), so everything is guarded by a mutex.
type Timings struct {
	mu  sync.Mutex
	now func() time.Time

	began time.Time

	dnsStart time.Time
	dns      *time.Duration

	connStarts map[string]time.Time
	connect    *time.Duration

	tlsStart time.Time
	tls      *time.Duration

	ttfb   *time.Duration
	reused bool
}

// New returns an empty Timings using the real clock.
func New() *Timings { return newTimings(time.Now) }

func newTimings(now func() time.Time) *Timings {
	return &Timings{now: now, connStarts: map[string]time.Time{}}
}

type ctxKey struct{}

// With returns a context carrying t, for Transport to find.
func With(ctx context.Context, t *Timings) context.Context {
	return context.WithValue(ctx, ctxKey{}, t)
}

// Transport wraps base so that any request whose context carries a Timings is traced.
func Transport(base http.RoundTripper) http.RoundTripper {
	return roundTripper{base}
}

type roundTripper struct{ base http.RoundTripper }

func (rt roundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	t, _ := req.Context().Value(ctxKey{}).(*Timings)
	if t == nil {
		return rt.base.RoundTrip(req)
	}
	t.begin()
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), t.clientTrace()))
	return rt.base.RoundTrip(req)
}

func (t *Timings) begin() {
	t.mu.Lock()
	t.began = t.now()
	t.mu.Unlock()
}

func (t *Timings) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart: func(httptrace.DNSStartInfo) { t.lock(func() { t.dnsStart = t.now() }) },
		DNSDone: func(httptrace.DNSDoneInfo) {
			t.lock(func() {
				if !t.dnsStart.IsZero() {
					d := t.now().Sub(t.dnsStart)
					t.dns = &d
				}
			})
		},
		ConnectStart: func(network, addr string) {
			t.lock(func() { t.connStarts[network+"|"+addr] = t.now() })
		},
		ConnectDone: func(network, addr string, err error) {
			t.lock(func() {
				// With dual-stack hosts several connects race; only a success counts.
				if start, ok := t.connStarts[network+"|"+addr]; ok && err == nil && t.connect == nil {
					d := t.now().Sub(start)
					t.connect = &d
				}
			})
		},
		TLSHandshakeStart: func() { t.lock(func() { t.tlsStart = t.now() }) },
		TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
			t.lock(func() {
				if err == nil && !t.tlsStart.IsZero() {
					d := t.now().Sub(t.tlsStart)
					t.tls = &d
				}
			})
		},
		GotConn: func(info httptrace.GotConnInfo) { t.lock(func() { t.reused = info.Reused }) },
		GotFirstResponseByte: func() {
			t.lock(func() {
				if !t.began.IsZero() && t.ttfb == nil {
					d := t.now().Sub(t.began)
					t.ttfb = &d
				}
			})
		},
	}
}

func (t *Timings) lock(f func()) {
	t.mu.Lock()
	defer t.mu.Unlock()
	f()
}

// Snapshot returns what has been measured so far.
func (t *Timings) Snapshot() Snapshot {
	t.mu.Lock()
	defer t.mu.Unlock()
	return Snapshot{DNS: t.dns, Connect: t.connect, TLS: t.tls, TTFB: t.ttfb, ConnReused: t.reused}
}
