// Package integration wires the real gateway pieces together in-process (proxy, observe,
// reporter, HTTP sender) between a fake LLM upstream and a fake Tracewell, to prove the
// whole path: a client call becomes correctly linked ingestion events.
package integration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/fakeupstream"
	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
	"github.com/veeky-ai/tracewell-gateway/internal/proxy"
	"github.com/veeky-ai/tracewell-gateway/internal/report"
)

type fakeTracewell struct {
	srv  *httptest.Server
	mu   sync.Mutex
	evs  []report.Event
	auth []string
}

func newFakeTracewell(t *testing.T) *fakeTracewell {
	f := &fakeTracewell{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Batch []report.Event }
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.mu.Lock()
		f.evs = append(f.evs, body.Batch...)
		f.auth = append(f.auth, r.Header.Get("Authorization"))
		f.mu.Unlock()
		w.WriteHeader(207)
		_, _ = io.WriteString(w, `{"successes":[],"errors":[]}`)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeTracewell) events() []report.Event {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]report.Event(nil), f.evs...)
}

type stack struct {
	gw       *httptest.Server
	reporter *report.Reporter
	tw       *fakeTracewell
	metrics  *metrics.Metrics
}

func newStack(t *testing.T, up fakeupstream.Options) *stack {
	t.Helper()
	us := httptest.NewServer(fakeupstream.Handler(up))
	t.Cleanup(us.Close)
	tw := newFakeTracewell(t)
	m := metrics.New()

	twURL, _ := url.Parse(tw.srv.URL)
	rep := report.New(report.Config{
		QueueSize: 100, BatchSize: 50, Workers: 2, FlushInterval: 50 * time.Millisecond, MaxAttempts: 3,
		BaseBackoff: time.Millisecond, MaxBackoff: 5 * time.Millisecond,
	}, report.NewHTTPSender(twURL, "pk-int", "sk-int", 2*time.Second), m)

	upURL, _ := url.Parse(us.URL)
	h := observe.Handler(proxy.New(upURL, 2*time.Second), observe.Options{
		PeekBytes: 4096, ParseMaxBytes: 1 << 20, CaptureMaxBytes: 1024, Sink: rep, Metrics: m,
	})
	gw := httptest.NewServer(h)
	t.Cleanup(gw.Close)
	return &stack{gw: gw, reporter: rep, tw: tw, metrics: m}
}

func (s *stack) call(t *testing.T, body string, hdr map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, s.gw.URL+"/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer sk-provider-key-DO-NOT-LEAK")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

// closeAndWait shuts down in the same order as main: drain the HTTP server first (handlers
// enqueue their observation just after the response is written), then flush the reporter.
func (s *stack) closeAndWait(t *testing.T) {
	t.Helper()
	s.gw.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.reporter.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func find(evs []report.Event, typ string) []report.Event {
	var out []report.Event
	for _, e := range evs {
		if e.Type == typ {
			out = append(out, e)
		}
	}
	return out
}

func TestNewTraceEndToEnd(t *testing.T) {
	s := newStack(t, fakeupstream.Options{Latency: 30 * time.Millisecond})
	resp := s.call(t, `{"model":"fake-1","messages":[]}`, nil)
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	s.closeAndWait(t) // flushes on shutdown

	evs := s.tw.events()
	if len(evs) != 3 {
		t.Fatalf("Tracewell received %d events, want 3: %+v", len(evs), evs)
	}
	root := find(evs, "trace-create")[0].Body
	gc := find(evs, "generation-create")[0].Body
	gu := find(evs, "generation-update")[0].Body
	if root["id"] != root["traceId"] || gc["traceId"] != root["id"] || gc["parentObservationId"] != root["id"] || gu["id"] != gc["id"] {
		t.Errorf("events are not linked correctly:\nroot=%v\ncreate=%v\nupdate=%v", root, gc, gu)
	}
	if gc["model"] != "fake-1" {
		t.Errorf("model = %v", gc["model"])
	}
	usage, _ := gu["usageDetails"].(map[string]any)
	if usage["input"] != 11.0 || usage["output"] != 7.0 || usage["total"] != 18.0 {
		t.Errorf("usage = %v", gu["usageDetails"])
	}
	gw := gu["metadata"].(map[string]any)["gateway"].(map[string]any)
	tm := gw["timingMs"].(map[string]any)
	if ttfb, _ := tm["ttfb"].(float64); ttfb < 30 {
		t.Errorf("ttfb = %v ms, want >= the 30ms upstream latency", tm["ttfb"])
	}

	// The auth header Tracewell saw is the gateway's own key pair, not the client's provider key.
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("pk-int:sk-int"))
	for _, a := range s.tw.auth {
		if a != wantAuth {
			t.Errorf("Authorization to Tracewell = %q", a)
		}
	}
}

func TestProviderKeyNeverReachesTracewell(t *testing.T) {
	s := newStack(t, fakeupstream.Options{})
	resp := s.call(t, `{"model":"m"}`, nil)
	resp.Body.Close()
	s.closeAndWait(t)
	raw, _ := json.Marshal(s.tw.events())
	if strings.Contains(string(raw), "sk-provider-key-DO-NOT-LEAK") {
		t.Errorf("provider API key leaked into reported events: %s", raw)
	}
}

func TestAttachToExistingTrace(t *testing.T) {
	s := newStack(t, fakeupstream.Options{})
	resp := s.call(t, `{"model":"m"}`, map[string]string{
		"X-Tracewell-Trace-Id": "existing-trace", "X-Tracewell-Parent-Observation-Id": "existing-span",
	})
	resp.Body.Close()
	s.closeAndWait(t)

	evs := s.tw.events()
	if len(evs) != 2 || len(find(evs, "trace-create")) != 0 {
		t.Fatalf("want only the 2 generation events, got %+v", evs)
	}
	gc := find(evs, "generation-create")[0].Body
	if gc["traceId"] != "existing-trace" || gc["parentObservationId"] != "existing-span" {
		t.Errorf("generation = %v", gc)
	}
}

func TestStreamingCallIsReportedWithItsUsageWhenAsked(t *testing.T) {
	s := newStack(t, fakeupstream.Options{Chunks: 3})
	resp := s.call(t, `{"model":"m","stream":true,"stream_options":{"include_usage":true}}`, nil)
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	s.closeAndWait(t)

	gu := find(s.tw.events(), "generation-update")[0].Body
	if gu["usageDetails"] == nil {
		t.Error("stream usage missing although the client asked for it")
	}
	if gw := gu["metadata"].(map[string]any)["gateway"].(map[string]any); gw["streaming"] != true {
		t.Errorf("streaming flag = %v", gw["streaming"])
	}
}

func TestUpstreamErrorBecomesAnErrorGeneration(t *testing.T) {
	s := newStack(t, fakeupstream.Options{})
	resp := s.call(t, `{"model":"m"}`, map[string]string{"X-Fake-Status": "500"})
	resp.Body.Close()
	s.closeAndWait(t)

	gu := find(s.tw.events(), "generation-update")[0].Body
	if gu["level"] != "ERROR" || gu["statusMessage"] == nil {
		t.Errorf("update = %v", gu)
	}
	if _, has := gu["usageDetails"]; has {
		t.Error("usage invented for a failed call")
	}
}

func TestShutdownFlushesEverythingQueued(t *testing.T) {
	s := newStack(t, fakeupstream.Options{})
	s.reporter = report.New(report.Config{ // long interval: only Close can flush
		QueueSize: 100, BatchSize: 500, Workers: 2, FlushInterval: time.Hour, MaxAttempts: 2,
		BaseBackoff: time.Millisecond, MaxBackoff: time.Millisecond,
	}, report.NewHTTPSender(mustURL(s.tw.srv.URL), "pk", "sk", time.Second), s.metrics)

	us := httptest.NewServer(fakeupstream.Handler(fakeupstream.Options{}))
	defer us.Close()
	gw := httptest.NewServer(observe.Handler(proxy.New(mustURL(us.URL), time.Second),
		observe.Options{PeekBytes: 1024, ParseMaxBytes: 1 << 20, Sink: s.reporter}))
	defer gw.Close()

	for i := 0; i < 20; i++ {
		resp, err := http.Post(gw.URL+"/v1/chat/completions", "application/json", strings.NewReader(`{"model":"m"}`))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}
	if n := len(s.tw.events()); n != 0 {
		t.Fatalf("%d events delivered before shutdown; the test needs them still queued", n)
	}
	gw.Close() // drain in-flight handlers first, as main does
	s.closeAndWait(t)
	if n := len(s.tw.events()); n != 60 {
		t.Errorf("delivered %d events at shutdown, want 60 (20 calls x 3)", n)
	}
}

func mustURL(s string) *url.URL { u, _ := url.Parse(s); return u }
