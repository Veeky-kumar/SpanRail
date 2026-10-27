package proxy

import (
	"errors"
	"github.com/veeky-ai/spanrail-gateway/internal/capture"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func newProxy(t *testing.T, upstream string, timeout time.Duration) *httptest.Server {
	t.Helper()
	u, err := url.Parse(upstream)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(New(u, timeout))
	t.Cleanup(srv.Close)
	return srv
}

func TestForwardsRequestUnchanged(t *testing.T) {
	var gotMethod, gotPath, gotQuery, gotAuth, gotCustom, gotBody, gotHost string
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotMethod, gotPath, gotQuery = r.Method, r.URL.Path, r.URL.RawQuery
		gotAuth, gotCustom, gotBody, gotHost = r.Header.Get("Authorization"), r.Header.Get("X-Custom"), string(b), r.Host
		w.Header().Set("X-Reply", "yes")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("pong"))
	}))
	defer up.Close()
	px := newProxy(t, up.URL, 5*time.Second)

	req, _ := http.NewRequest(http.MethodPost, px.URL+"/v1/chat/completions?a=1&b=two", strings.NewReader(`{"model":"m"}`))
	req.Header.Set("Authorization", "Bearer sk-test")
	req.Header.Set("X-Custom", "abc")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if gotMethod != http.MethodPost || gotPath != "/v1/chat/completions" || gotQuery != "a=1&b=two" {
		t.Errorf("request line: %s %s ?%s", gotMethod, gotPath, gotQuery)
	}
	if gotAuth != "Bearer sk-test" || gotCustom != "abc" {
		t.Errorf("headers not forwarded: auth=%q custom=%q", gotAuth, gotCustom)
	}
	if gotBody != `{"model":"m"}` {
		t.Errorf("body = %q", gotBody)
	}
	if gotHost != strings.TrimPrefix(up.URL, "http://") {
		t.Errorf("upstream saw Host %q, want upstream host", gotHost)
	}
	if resp.StatusCode != http.StatusCreated || resp.Header.Get("X-Reply") != "yes" || string(body) != "pong" {
		t.Errorf("response: %d %q %q", resp.StatusCode, resp.Header.Get("X-Reply"), body)
	}
}

func TestUpstreamPathPrefixIsPreserved(t *testing.T) {
	var gotPath string
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { gotPath = r.URL.Path }))
	defer up.Close()
	px := newProxy(t, up.URL+"/api", 5*time.Second)

	resp, err := http.Get(px.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if gotPath != "/api/v1/models" {
		t.Errorf("path = %q, want /api/v1/models", gotPath)
	}
}

func TestUpstreamErrorStatusPassesThrough(t *testing.T) {
	for _, code := range []int{400, 429, 500, 503} {
		up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "upstream says no", code)
		}))
		px := newProxy(t, up.URL, 5*time.Second)
		resp, err := http.Get(px.URL)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		up.Close()
		if resp.StatusCode != code || !strings.Contains(string(body), "upstream says no") {
			t.Errorf("code %d: got %d %q", code, resp.StatusCode, body)
		}
	}
}

func TestConnectionErrorIs502(t *testing.T) {
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := l.Addr().String()
	l.Close() // nothing listens here any more
	px := newProxy(t, "http://"+addr, 5*time.Second)

	resp, err := http.Get(px.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", resp.StatusCode)
	}
}

func TestUpstreamTimeoutIs504(t *testing.T) {
	release := make(chan struct{})
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer up.Close()
	defer close(release)
	px := newProxy(t, up.URL, 100*time.Millisecond)

	start := time.Now()
	resp, err := http.Get(px.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusGatewayTimeout {
		t.Errorf("status = %d, want 504", resp.StatusCode)
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("took %v, timeout not enforced", time.Since(start))
	}
}

func TestHopByHopHeadersNotForwarded(t *testing.T) {
	var gotConn, gotKeepAlive string
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotConn, gotKeepAlive = r.Header.Get("X-Hop"), r.Header.Get("Keep-Alive")
	}))
	defer up.Close()
	px := newProxy(t, up.URL, 5*time.Second)

	req, _ := http.NewRequest(http.MethodGet, px.URL, nil)
	req.Header.Set("Connection", "X-Hop")
	req.Header.Set("X-Hop", "secret")
	req.Header.Set("Keep-Alive", "timeout=5")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if gotConn != "" || gotKeepAlive != "" {
		t.Errorf("hop-by-hop leaked: X-Hop=%q Keep-Alive=%q", gotConn, gotKeepAlive)
	}
}

func TestSpanrailControlHeadersAreStripped(t *testing.T) {
	var seen http.Header
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen = r.Header.Clone() }))
	defer up.Close()
	px := newProxy(t, up.URL, 5*time.Second)

	req, _ := http.NewRequest(http.MethodGet, px.URL, nil)
	req.Header.Set("X-Spanrail-Trace-Id", "t")
	req.Header.Set("x-spanrail-custom", "c")
	req.Header.Set("X-Other", "kept")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	for k := range seen {
		if strings.HasPrefix(strings.ToLower(k), "x-spanrail-") {
			t.Errorf("%s forwarded to upstream", k)
		}
	}
	if seen.Get("X-Other") != "kept" {
		t.Error("unrelated headers must still be forwarded")
	}
}

func TestAcceptEncodingOffersGzipWhenTheClientAcceptsIt(t *testing.T) {
	// Real clients (browsers, Node) offer br/zstd. The gateway can only read usage from gzip or
	// identity, so when the client accepts gzip, gzip is what the provider is asked for.
	for _, tc := range []struct{ in, want string }{
		{"gzip, deflate, br, zstd", "gzip"},
		{"gzip;q=0.5, br", "gzip"},
		{"br, gzip", "gzip"},
		{"gzip", "gzip"},
		{"br", "br"}, // client cannot decode gzip: leave it alone
		{"identity", "identity"},
	} {
		var got string
		up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { got = r.Header.Get("Accept-Encoding") }))
		px := newProxy(t, up.URL, 5*time.Second)
		req, _ := http.NewRequest(http.MethodGet, px.URL, nil)
		req.Header.Set("Accept-Encoding", tc.in)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		up.Close()
		if got != tc.want {
			t.Errorf("client %q: upstream saw %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestClientAddressIsNotSharedWithTheProvider(t *testing.T) {
	var seen http.Header
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen = r.Header.Clone() }))
	defer up.Close()
	px := newProxy(t, up.URL, 5*time.Second)
	req, _ := http.NewRequest(http.MethodGet, px.URL, nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	for _, h := range []string{"X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "Forwarded"} {
		if seen.Get(h) != "" {
			t.Errorf("%s = %q reached the provider", h, seen.Get(h))
		}
	}
}

func TestDotDotIsRejectedWhenTheUpstreamHasAPathPrefix(t *testing.T) {
	var called bool
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	defer up.Close()

	// With a prefix, "/../x" could escape it (SetURL joins without cleaning).
	prefixed := newProxy(t, up.URL+"/api", 5*time.Second)
	req, _ := http.NewRequest(http.MethodGet, prefixed.URL, nil)
	req.URL.Path = "/v1/../../admin"
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest || called {
		t.Errorf("status=%d called=%v, want 400 and no upstream call", resp.StatusCode, called)
	}

	// Without a prefix there is nothing to escape, so the proxy stays transparent.
	plain := newProxy(t, up.URL, 5*time.Second)
	req2, _ := http.NewRequest(http.MethodGet, plain.URL, nil)
	req2.URL.Path = "/v1/a/../b"
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if !called {
		t.Error("no-prefix proxy must forward the request untouched")
	}
}

type failingBody struct{ err error }

func (f failingBody) Read([]byte) (int, error) { return 0, f.err }
func (f failingBody) Close() error             { return nil }

func TestClientBodyFailureIsNotBlamedOnTheUpstream(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.Copy(io.Discard, r.Body) }))
	defer up.Close()
	u, _ := url.Parse(up.URL)
	h := New(u, 5*time.Second)

	for name, tc := range map[string]struct {
		err  error
		want int
	}{
		"client stalled":      {&capture.ClientBodyError{Err: os.ErrDeadlineExceeded}, http.StatusRequestTimeout},
		"client reset socket": {&capture.ClientBodyError{Err: errors.New("connection reset")}, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/x", nil)
			req.ContentLength = 100
			req.Body = failingBody{tc.err}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d (a client problem must not look like an upstream outage)", rec.Code, tc.want)
			}
		})
	}
}
