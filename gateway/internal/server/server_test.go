package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRoutes(t *testing.T) {
	proxied := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	srv := httptest.NewServer(Handler(proxied))
	defer srv.Close()

	tests := []struct {
		path     string
		wantCode int
		wantBody string
	}{
		{"/healthz", http.StatusOK, "ok"},
		{"/v1/chat/completions", http.StatusTeapot, ""},
		{"/", http.StatusTeapot, ""},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			resp, err := http.Get(srv.URL + tt.path)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			b, _ := io.ReadAll(resp.Body)
			if resp.StatusCode != tt.wantCode {
				t.Errorf("status = %d, want %d", resp.StatusCode, tt.wantCode)
			}
			if tt.wantBody != "" && string(b) != tt.wantBody {
				t.Errorf("body = %q, want %q", b, tt.wantBody)
			}
		})
	}
}
