package server

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestHandlerRoutes(t *testing.T) {
	proxied := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	var ready atomic.Bool
	ready.Store(true)
	metricsH := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("m")) })
	srv := httptest.NewServer(Handler(proxied, Ops{Metrics: metricsH, Ready: ready.Load}))
	defer srv.Close()

	get := func(path string) (int, string) {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(b)
	}

	tests := []struct {
		path     string
		wantCode int
		wantBody string
	}{
		{"/healthz", http.StatusOK, "ok"},
		{"/readyz", http.StatusOK, "ready"},
		{"/metrics", http.StatusOK, "m"},
		{"/v1/chat/completions", http.StatusTeapot, ""},
		{"/", http.StatusTeapot, ""},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			code, body := get(tt.path)
			if code != tt.wantCode {
				t.Errorf("status = %d, want %d", code, tt.wantCode)
			}
			if tt.wantBody != "" && body != tt.wantBody {
				t.Errorf("body = %q, want %q", body, tt.wantBody)
			}
		})
	}

	// Draining: not ready, but still alive, so an orchestrator stops routing without restarting us.
	ready.Store(false)
	if code, _ := get("/readyz"); code != http.StatusServiceUnavailable {
		t.Errorf("readyz while draining = %d, want 503", code)
	}
	if code, _ := get("/healthz"); code != http.StatusOK {
		t.Errorf("healthz while draining = %d, want 200", code)
	}
}

func TestProxyIsTransparentForOddPathsAndMethods(t *testing.T) {
	var gotPath, gotMethod string
	proxied := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		w.WriteHeader(http.StatusAccepted)
	})
	srv := httptest.NewServer(Handler(proxied, Ops{}))
	defer srv.Close()

	for _, tc := range []struct{ method, path string }{
		{"POST", "//v1/x"},     // ServeMux would 301 this to /v1/x
		{"POST", "/v1/a/../b"}, // and this
		{"POST", "/healthz"},   // only GET is ours; anything else belongs to the upstream
		{"DELETE", "/metrics"},
	} {
		req, _ := http.NewRequest(tc.method, srv.URL, nil)
		req.URL.Path = tc.path
		client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusAccepted || gotPath != tc.path || gotMethod != tc.method {
			t.Errorf("%s %s: status=%d, proxy saw %s %q", tc.method, tc.path, resp.StatusCode, gotMethod, gotPath)
		}
	}
}

func TestNewSetsTimeoutsAgainstSlowClients(t *testing.T) {
	s := New(":0", http.NotFoundHandler())
	if s.ReadHeaderTimeout <= 0 || s.IdleTimeout <= 0 {
		t.Errorf("ReadHeaderTimeout=%v IdleTimeout=%v, both must be set", s.ReadHeaderTimeout, s.IdleTimeout)
	}
	if s.WriteTimeout != 0 {
		t.Errorf("WriteTimeout=%v: must stay 0 or long streaming responses are cut off", s.WriteTimeout)
	}
}

func TestProbe(t *testing.T) {
	ok := httptest.NewServer(Handler(http.NotFoundHandler(), Ops{}))
	defer ok.Close()
	addr := ok.Listener.Addr().String()
	if err := Probe(addr, false); err != nil {
		t.Errorf("healthy server: %v", err)
	}
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer bad.Close()
	if err := Probe(bad.Listener.Addr().String(), false); err == nil {
		t.Error("a 500 must fail the probe")
	}
	if err := Probe("127.0.0.1:1", false); err == nil {
		t.Error("nothing listening must fail the probe")
	}
	tlsSrv := httptest.NewTLSServer(Handler(http.NotFoundHandler(), Ops{}))
	defer tlsSrv.Close()
	if err := Probe(tlsSrv.Listener.Addr().String(), true); err != nil {
		t.Errorf("tls server (self-signed, loopback): %v", err)
	}
}

func TestProbeAddrWithWildcardHost(t *testing.T) {
	ok := httptest.NewServer(Handler(http.NotFoundHandler(), Ops{}))
	defer ok.Close()
	_, port, _ := net.SplitHostPort(ok.Listener.Addr().String())
	if err := Probe(":"+port, false); err != nil { // LISTEN_ADDR=":8080" style
		t.Errorf("%v", err)
	}
}

func TestOpsHandlerServesOnlyOpsEndpoints(t *testing.T) {
	metricsH := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("m")) })
	srv := httptest.NewServer(OpsHandler(Ops{Metrics: metricsH, Ready: func() bool { return true }}))
	defer srv.Close()
	for path, want := range map[string]int{"/healthz": 200, "/readyz": 200, "/metrics": 200, "/v1/chat/completions": 404} {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != want {
			t.Errorf("%s = %d, want %d", path, resp.StatusCode, want)
		}
	}
}

func TestNewLimitsHeaderSize(t *testing.T) {
	s := New(":0", http.NotFoundHandler())
	if s.MaxHeaderBytes <= 0 || s.MaxHeaderBytes > 128<<10 {
		t.Errorf("MaxHeaderBytes = %d; the 1 MiB default lets each connection pin a lot of memory", s.MaxHeaderBytes)
	}
}

func TestProbeHost(t *testing.T) {
	for addr, want := range map[string]string{
		":8080":          "127.0.0.1",
		"0.0.0.0:8080":   "127.0.0.1",
		"[::]:8080":      "127.0.0.1",
		"127.0.0.1:8080": "127.0.0.1",
		"10.0.0.5:8080":  "10.0.0.5",
		"[::1]:8080":     "::1",
		"localhost:8080": "localhost",
	} {
		got, err := probeHost(addr)
		if err != nil || got != want {
			t.Errorf("probeHost(%q) = %q, %v; want %q", addr, got, err, want)
		}
	}
	if _, err := probeHost("no-port"); err == nil {
		t.Error("an address without a port must be an error")
	}
}
