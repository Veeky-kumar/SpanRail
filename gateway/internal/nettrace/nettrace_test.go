package nettrace

import (
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"testing"
	"time"
)

// fakeClock lets tests move time by hand so the arithmetic is checked exactly.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newFake() (*Timings, *fakeClock) {
	c := &fakeClock{t: time.Unix(1000, 0)}
	return newTimings(c.now), c
}

func ms(d *time.Duration) time.Duration {
	if d == nil {
		return -1
	}
	return *d
}

func TestPhasesAreMeasuredFromTheirOwnStartAndDone(t *testing.T) {
	tm, c := newFake()
	h := tm.clientTrace()

	tm.begin() // RoundTrip starts
	c.advance(1 * time.Millisecond)
	h.DNSStart(httptrace.DNSStartInfo{})
	c.advance(20 * time.Millisecond)
	h.DNSDone(httptrace.DNSDoneInfo{})
	h.ConnectStart("tcp", "1.2.3.4:443")
	c.advance(30 * time.Millisecond)
	h.ConnectDone("tcp", "1.2.3.4:443", nil)
	h.TLSHandshakeStart()
	c.advance(40 * time.Millisecond)
	h.TLSHandshakeDone(tls.ConnectionState{}, nil)
	h.GotConn(httptrace.GotConnInfo{Reused: false})
	c.advance(100 * time.Millisecond)
	h.GotFirstResponseByte()

	s := tm.Snapshot()
	if ms(s.DNS) != 20*time.Millisecond || ms(s.Connect) != 30*time.Millisecond || ms(s.TLS) != 40*time.Millisecond {
		t.Errorf("dns=%v connect=%v tls=%v", ms(s.DNS), ms(s.Connect), ms(s.TLS))
	}
	// TTFB runs from the start of the round trip: 1+20+30+40+100.
	if ms(s.TTFB) != 191*time.Millisecond {
		t.Errorf("ttfb = %v, want 191ms", ms(s.TTFB))
	}
	if s.ConnReused == nil || *s.ConnReused {
		t.Errorf("ConnReused = %v, want false (a connection was obtained and it was new)", s.ConnReused)
	}
}

func TestReusedConnectionHasNoSetupPhases(t *testing.T) {
	tm, c := newFake()
	h := tm.clientTrace()
	tm.begin()
	h.GotConn(httptrace.GotConnInfo{Reused: true})
	c.advance(50 * time.Millisecond)
	h.GotFirstResponseByte()

	s := tm.Snapshot()
	if s.DNS != nil || s.Connect != nil || s.TLS != nil {
		t.Errorf("setup phases must be absent on a reused connection, got %v %v %v", s.DNS, s.Connect, s.TLS)
	}
	if s.ConnReused == nil || !*s.ConnReused || ms(s.TTFB) != 50*time.Millisecond {
		t.Errorf("reused=%v ttfb=%v", s.ConnReused, ms(s.TTFB))
	}
}

// Dual-stack dialing starts several connects in parallel; only the winner's time counts.
func TestConnectUsesTheSuccessfulAttempt(t *testing.T) {
	tm, c := newFake()
	h := tm.clientTrace()
	tm.begin()
	h.ConnectStart("tcp", "[::1]:80")
	c.advance(5 * time.Millisecond)
	h.ConnectStart("tcp", "127.0.0.1:80")
	c.advance(10 * time.Millisecond)
	h.ConnectDone("tcp", "[::1]:80", net.ErrClosed) // failed
	c.advance(7 * time.Millisecond)
	h.ConnectDone("tcp", "127.0.0.1:80", nil) // won: started 17ms ago

	if got := ms(tm.Snapshot().Connect); got != 17*time.Millisecond {
		t.Errorf("connect = %v, want 17ms", got)
	}
}

func TestFailedConnectLeavesConnectUnknown(t *testing.T) {
	tm, c := newFake()
	h := tm.clientTrace()
	tm.begin()
	h.ConnectStart("tcp", "1.2.3.4:80")
	c.advance(time.Second)
	h.ConnectDone("tcp", "1.2.3.4:80", net.ErrClosed)
	if s := tm.Snapshot(); s.Connect != nil || s.TTFB != nil {
		t.Errorf("connect=%v ttfb=%v, want nil nil", s.Connect, s.TTFB)
	}
}

func TestNothingMeasuredBeforeItHappens(t *testing.T) {
	tm, _ := newFake()
	if s := tm.Snapshot(); s.DNS != nil || s.Connect != nil || s.TLS != nil || s.TTFB != nil || s.ConnReused != nil {
		t.Errorf("fresh snapshot not empty: %+v", s)
	}
}

// ---- real network ----

func get(t *testing.T, rt http.RoundTripper, url string) Snapshot {
	t.Helper()
	tm := New()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req = req.WithContext(With(req.Context(), tm))
	resp, err := Transport(rt).RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return tm.Snapshot()
}

func TestRealPlainHTTPConnectThenReuse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(60 * time.Millisecond)
		_, _ = io.WriteString(w, "x")
	}))
	defer srv.Close()
	base := &http.Transport{}
	defer base.CloseIdleConnections()

	first := get(t, base, srv.URL)
	if first.Connect == nil || first.DNS != nil || first.TLS != nil || first.ConnReused == nil || *first.ConnReused {
		t.Errorf("first: %+v (connect set, dns/tls nil for IP + http)", first)
	}
	if first.TTFB == nil || *first.TTFB < 60*time.Millisecond {
		t.Errorf("ttfb = %v, want >= 60ms server delay", first.TTFB)
	}

	second := get(t, base, srv.URL)
	if second.ConnReused == nil || !*second.ConnReused || second.Connect != nil {
		t.Errorf("second: %+v (want reused, no connect)", second)
	}
}

func TestRealTLSAndDNS(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()
	base := srv.Client().Transport.(*http.Transport).Clone()
	// httptest's certificate is only valid for example.com; verify against that name while
	// still dialing "localhost" so the DNS hooks fire.
	base.TLSClientConfig.ServerName = "example.com"

	_, port, _ := net.SplitHostPort(strings.TrimPrefix(srv.URL, "https://"))
	// "localhost" forces a name lookup, so the DNS hooks fire.
	s := get(t, base, "https://localhost:"+port)
	if s.DNS == nil || s.Connect == nil || s.TLS == nil || s.TTFB == nil {
		t.Errorf("want all four phases on a fresh https connection: %+v", s)
	}
}

func TestTransportWithoutTimingsInContextJustForwards(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "ok") }))
	defer srv.Close()
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	resp, err := Transport(&http.Transport{}).RoundTrip(req) // no Timings in ctx: must not panic
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(b) != "ok" {
		t.Errorf("body = %q", b)
	}
}

// If the request never obtained a connection (client stalled, DNS failed) nothing says whether
// one would have been reused, so it must stay unknown rather than read as "new connection".
func TestConnReusedStaysUnknownWithoutAConnection(t *testing.T) {
	tm, c := newFake()
	h := tm.clientTrace()
	tm.begin()
	h.DNSStart(httptrace.DNSStartInfo{})
	c.advance(5 * time.Millisecond)
	h.DNSDone(httptrace.DNSDoneInfo{})
	if s := tm.Snapshot(); s.ConnReused != nil {
		t.Errorf("ConnReused = %v before GotConn", *s.ConnReused)
	}
}
