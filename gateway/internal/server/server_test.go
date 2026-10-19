package server

import (
	"io"
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
