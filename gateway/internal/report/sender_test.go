package report

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func events(n int) []Event {
	out := make([]Event, n)
	for i := range out {
		out[i] = Event{ID: "ev-" + string(rune('a'+i)), Timestamp: "2026-10-20T10:00:00.000Z", Type: "generation-update",
			Body: map[string]any{"id": "ent-" + string(rune('a'+i))}}
	}
	return out
}

func sender(t *testing.T, h http.HandlerFunc) (*HTTPSender, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	return NewHTTPSender(u, "pk-test", "sk-secret-value", 2*time.Second), srv
}

func TestSenderRequestShape(t *testing.T) {
	var gotAuth, gotCT, gotPath, gotMethod string
	var body struct{ Batch []Event }
	s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotCT, gotPath, gotMethod = r.Header.Get("Authorization"), r.Header.Get("Content-Type"), r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(207)
		_, _ = io.WriteString(w, `{"successes":[{"id":"ent-a","status":201},{"id":"ent-b","status":201}],"errors":[]}`)
	})
	res := s.Send(context.Background(), events(2))

	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("pk-test:sk-secret-value"))
	if gotMethod != "POST" || gotPath != "/api/public/ingestion" || gotAuth != wantAuth || !strings.HasPrefix(gotCT, "application/json") {
		t.Errorf("request: %s %s auth=%q ct=%q", gotMethod, gotPath, gotAuth, gotCT)
	}
	if len(body.Batch) != 2 || body.Batch[0].ID != "ev-a" {
		t.Errorf("batch = %+v", body.Batch)
	}
	if res.Accepted != 2 || res.Rejected != 0 || len(res.Retry) != 0 || res.Err != nil {
		t.Errorf("result = %+v", res)
	}
}

func TestSenderBasePathIsKept(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(207)
		_, _ = io.WriteString(w, `{"successes":[],"errors":[]}`)
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL + "/tracewell/")
	NewHTTPSender(u, "p", "s", time.Second).Send(context.Background(), events(1))
	if gotPath != "/tracewell/api/public/ingestion" {
		t.Errorf("path = %q", gotPath)
	}
}

func TestSenderPartialFailureSplitsRetryableFromRejected(t *testing.T) {
	// Tracewell reports validation failures by event id and storage failures by entity id.
	s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(207)
		_, _ = io.WriteString(w, `{"successes":[{"id":"ent-a","status":201}],
			"errors":[{"id":"ev-b","status":400,"message":"bad datetime"},{"id":"ent-c","status":500,"message":"db down"}]}`)
	})
	res := s.Send(context.Background(), events(3))
	if res.Accepted != 1 || res.Rejected != 1 || len(res.Retry) != 1 || res.Retry[0].ID != "ev-c" {
		t.Errorf("result = %+v", res)
	}
	if res.Err == nil {
		t.Error("Err should describe the failures")
	}
}

func TestSenderStatusHandling(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		wantRetry  bool
		wantReject bool
	}{
		{"unavailable", 503, true, false},
		{"internal error", 500, true, false},
		{"too many requests", 429, true, false},
		{"request timeout from a proxy in front", 408, true, false},
		{"too early", 425, true, false},
		{"unauthorized", 401, false, true},
		{"bad request", 400, false, true},
		{"payload too large", 413, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) {
				http.Error(w, "nope", tt.status)
			})
			res := s.Send(context.Background(), events(2))
			if (len(res.Retry) == 2) != tt.wantRetry || (res.Rejected == 2) != tt.wantReject || res.Err == nil || res.Accepted != 0 {
				t.Errorf("status %d: %+v", tt.status, res)
			}
		})
	}
}

func TestSenderConnectionErrorIsRetryableAndDoesNotLeakTheSecret(t *testing.T) {
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := l.Addr().String()
	l.Close()
	u, _ := url.Parse("http://" + addr)
	res := NewHTTPSender(u, "pk-test", "sk-secret-value", time.Second).Send(context.Background(), events(2))
	if len(res.Retry) != 2 || res.Err == nil {
		t.Fatalf("result = %+v", res)
	}
	if strings.Contains(res.Err.Error(), "sk-secret-value") || strings.Contains(res.Err.Error(), base64.StdEncoding.EncodeToString([]byte("pk-test:sk-secret-value"))) {
		t.Errorf("error text leaks credentials: %v", res.Err)
	}
}

func TestSenderTimesOutASlowTracewell(t *testing.T) {
	release := make(chan struct{})
	s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) { <-release })
	defer close(release)
	s.client.Timeout = 100 * time.Millisecond
	start := time.Now()
	res := s.Send(context.Background(), events(1))
	if len(res.Retry) != 1 || time.Since(start) > 2*time.Second {
		t.Errorf("res=%+v after %v", res, time.Since(start))
	}
}

func TestSenderIgnoresGarbage207Body(t *testing.T) {
	s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(207)
		_, _ = io.WriteString(w, `<html>proxy error page</html>`)
	})
	res := s.Send(context.Background(), events(2))
	// We cannot tell what was stored; retrying is safe because ingestion is idempotent per event id.
	if len(res.Retry) != 2 || res.Err == nil {
		t.Errorf("result = %+v", res)
	}
}

func TestSenderUnmatchedErrorIsNotCountedAsAccepted(t *testing.T) {
	for name, tc := range map[string]struct {
		status                int
		wantRetry, wantReject bool
	}{
		"4xx cannot be attributed, so none are counted accepted": {400, false, true},
		"5xx cannot be attributed, so everything is retried":     {500, true, false},
	} {
		t.Run(name, func(t *testing.T) {
			s, _ := sender(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(207)
				_, _ = io.WriteString(w, fmt.Sprintf(`{"successes":[],"errors":[{"id":"something-else","status":%d,"message":"x"}]}`, tc.status))
			})
			res := s.Send(context.Background(), events(3))
			if res.Err == nil {
				t.Error("an unattributable error must surface in Err")
			}
			if res.Accepted == 3 {
				t.Error("all events counted as accepted despite a reported error")
			}
			if (len(res.Retry) == 3) != tc.wantRetry || (res.Rejected > 0) != tc.wantReject {
				t.Errorf("result = %+v", res)
			}
		})
	}
}
