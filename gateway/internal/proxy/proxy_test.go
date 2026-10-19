package proxy

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func TestTracewellControlHeadersAreStripped(t *testing.T) {
	var seen http.Header
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen = r.Header.Clone() }))
	defer up.Close()
	px := newProxy(t, up.URL, 5*time.Second)

	req, _ := http.NewRequest(http.MethodGet, px.URL, nil)
	req.Header.Set("X-Tracewell-Trace-Id", "t")
	req.Header.Set("x-tracewell-custom", "c")
	req.Header.Set("X-Other", "kept")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	for k := range seen {
		if strings.HasPrefix(strings.ToLower(k), "x-tracewell-") {
			t.Errorf("%s forwarded to upstream", k)
		}
	}
	if seen.Get("X-Other") != "kept" {
		t.Error("unrelated headers must still be forwarded")
	}
}
