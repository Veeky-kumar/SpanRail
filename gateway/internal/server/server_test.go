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
