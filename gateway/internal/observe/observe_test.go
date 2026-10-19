package observe

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/capture"
	"github.com/veeky-ai/tracewell-gateway/internal/proxy"
)

type sink struct {
	mu  sync.Mutex
	got []Observation
	ch  chan Observation
}

func newSink() *sink { return &sink{ch: make(chan Observation, 16)} }
func (s *sink) Enqueue(o Observation) bool {
	s.mu.Lock()
	s.got = append(s.got, o)
	s.mu.Unlock()
	s.ch <- o
	return true
}
func (s *sink) next(t *testing.T) Observation {
	t.Helper()
	select {
	case o := <-s.ch:
		return o
	case <-time.After(3 * time.Second):
		t.Fatal("no observation reported")
		return Observation{}
	}
}
func (s *sink) count() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.got) }

func setup(t *testing.T, up http.Handler, mod func(*Options)) (*httptest.Server, *sink) {
	t.Helper()
	us := httptest.NewServer(up)
	t.Cleanup(us.Close)
	u, _ := url.Parse(us.URL)
	sk := newSink()
	opts := Options{PeekBytes: 4096, ParseMaxBytes: 1 << 20, CaptureMaxBytes: 1024, Sink: sk}
	if mod != nil {
		mod(&opts)
	}
	gw := httptest.NewServer(Handler(proxy.New(u, 2*time.Second), opts))
	t.Cleanup(gw.Close)
	return gw, sk
}

func post(t *testing.T, url, body string, hdr map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestNonStreamingUsageModelAndStatus(t *testing.T) {
	const reply = `{"id":"c1","usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}`
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, reply)
	}), nil)

	resp := post(t, gw.URL+"/v1/chat/completions", `{"model":"gpt-4o-mini"}`, nil)
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(b) != reply {
		t.Fatalf("client body altered: %q", b)
	}
	o := sk.next(t)
	if o.Model != "gpt-4o-mini" || o.Status != 200 || o.Streaming || o.ResponseBytes != int64(len(reply)) {
		t.Errorf("observation = %+v", o)
	}
	if want := (capture.Usage{"input": 12, "output": 5, "total": 17}); !reflect.DeepEqual(o.Usage, want) {
		t.Errorf("usage = %v", o.Usage)
	}
	if o.Name != "chat.completions" || o.Path != "/v1/chat/completions" || o.Method != "POST" {
		t.Errorf("name/path = %q %q %q", o.Name, o.Path, o.Method)
	}
	if o.ID == "" || o.End.Before(o.Start) || o.Start.IsZero() {
		t.Errorf("id/time: %+v", o)
	}
}

// The core streaming guarantee: the first chunk must reach the client while the upstream
// is still holding the rest back. A buffering proxy would deadlock this test.
func TestSSEIsNotBufferedAndFinalUsageIsCaptured(t *testing.T) {
	release := make(chan struct{})
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n")
		w.(http.Flusher).Flush()
		<-release
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1,\"total_tokens\":5}}\n\ndata: [DONE]\n\n")
	}), nil)

	// If the proxy buffers, response headers never arrive while the upstream is held open,
	// so the deadline must cover Do() itself, not just the body read.
	var once sync.Once
	releaseUpstream := func() { once.Do(func() { close(release) }) }
	defer releaseUpstream()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, gw.URL+"/v1/chat/completions", strings.NewReader(`{"model":"m","stream":true}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("no response while upstream still open: stream is buffered (%v)", err)
	}
	defer resp.Body.Close()

	first := make([]byte, 5)
	if _, err := io.ReadFull(resp.Body, first); err != nil || string(first) != "data:" {
		t.Fatalf("first chunk not delivered while upstream still open: %q %v", first, err)
	}
	releaseUpstream()
	rest, _ := io.ReadAll(resp.Body)
	if !bytes.Contains(rest, []byte("[DONE]")) {
		t.Errorf("rest of stream missing: %q", rest)
	}

	o := sk.next(t)
	if !o.Streaming || o.Model != "m" {
		t.Errorf("observation = %+v", o)
	}
	if want := (capture.Usage{"input": 4, "output": 1, "total": 5}); !reflect.DeepEqual(o.Usage, want) {
		t.Errorf("usage = %v", o.Usage)
	}
}

func TestSSEWithoutUsageIsUnknownNotInvented(t *testing.T) {
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: [DONE]\n\n")
	}), nil)
	post(t, gw.URL+"/v1/chat/completions", `{"model":"m","stream":true}`, nil).Body.Close()
	if o := sk.next(t); o.Usage != nil {
		t.Errorf("usage = %v, want nil", o.Usage)
	}
}

func TestGzipResponseUsageParsedAndBytesUntouched(t *testing.T) {
	var zbuf bytes.Buffer
	zw := gzip.NewWriter(&zbuf)
	_, _ = zw.Write([]byte(`{"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}`))
	zw.Close()
	compressed := zbuf.Bytes()

	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(compressed)
	}), nil)

	// Setting Accept-Encoding ourselves stops Go's client from transparently decoding.
	resp := post(t, gw.URL+"/v1/chat/completions", `{"model":"m"}`, map[string]string{"Accept-Encoding": "gzip"})
	got, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !bytes.Equal(got, compressed) {
		t.Error("client did not receive the original compressed bytes")
	}
	o := sk.next(t)
	if want := (capture.Usage{"input": 3, "output": 4, "total": 7}); !reflect.DeepEqual(o.Usage, want) {
		t.Errorf("usage = %v", o.Usage)
	}
	if o.ResponseBytes != int64(len(compressed)) {
		t.Errorf("ResponseBytes = %d, want wire size %d", o.ResponseBytes, len(compressed))
	}
}

func TestUnsupportedEncodingIsUnknownUsage(t *testing.T) {
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "br")
		_, _ = io.WriteString(w, `{"usage":{"prompt_tokens":3}}`)
	}), nil)
	post(t, gw.URL+"/v1/x", `{}`, nil).Body.Close()
	if o := sk.next(t); o.Usage != nil {
		t.Errorf("usage = %v, want nil", o.Usage)
	}
}

func TestLargeRequestBodyForwardedIntact(t *testing.T) {
	body := `{"model":"m","p":"` + strings.Repeat("z", 200_000) + `"}`
	var got string
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got = string(b)
	}), nil)
	post(t, gw.URL+"/v1/x", body, nil).Body.Close()
	if got != body {
		t.Errorf("upstream got %d bytes, sent %d", len(got), len(body))
	}
	if o := sk.next(t); o.Model != "m" {
		t.Errorf("model = %q", o.Model)
	}
}

func TestUpstreamFailureIsReported(t *testing.T) {
	us := httptest.NewServer(http.NotFoundHandler())
	u, _ := url.Parse(us.URL)
	us.Close() // nothing listens any more
	sk := newSink()
	gw := httptest.NewServer(Handler(proxy.New(u, time.Second), Options{PeekBytes: 1024, ParseMaxBytes: 1024, Sink: sk}))
	defer gw.Close()

	resp := post(t, gw.URL+"/v1/x", `{"model":"m"}`, nil)
	resp.Body.Close()
	o := sk.next(t)
	if resp.StatusCode != 502 || o.Status != 502 || o.Model != "m" {
		t.Errorf("client=%d observation=%+v", resp.StatusCode, o)
	}
}

func TestOnlyPostIsReported(t *testing.T) {
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}), nil)
	resp, err := http.Get(gw.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	post(t, gw.URL+"/v1/x", `{}`, nil).Body.Close()
	sk.next(t)
	if sk.count() != 1 {
		t.Errorf("reported %d observations, want 1 (POST only)", sk.count())
	}
}

func TestHeadersRedactedAndOffByDefault(t *testing.T) {
	up := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	hdr := map[string]string{"Authorization": "Bearer sk-live-123", "X-Trace": "t"}

	gw, sk := setup(t, up, nil)
	post(t, gw.URL+"/v1/x", `{}`, hdr).Body.Close()
	if o := sk.next(t); o.Headers != nil {
		t.Errorf("headers captured by default: %v", o.Headers)
	}

	gw2, sk2 := setup(t, up, func(o *Options) { o.CaptureHeaders = true; o.RedactHeaders = []string{"x-trace"} })
	post(t, gw2.URL+"/v1/x", `{}`, hdr).Body.Close()
	o := sk2.next(t)
	if o.Headers == nil || o.Headers["Authorization"] == "Bearer sk-live-123" || o.Headers["X-Trace"] == "t" {
		t.Errorf("secret header leaked or headers missing: %v", o.Headers)
	}
}

func TestBodiesCapturedOnlyWhenEnabledAndCapped(t *testing.T) {
	up := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"out":"`+strings.Repeat("o", 5000)+`"}`)
	})
	reqBody := `{"model":"m","prompt":"secret prompt"}`

	gw, sk := setup(t, up, nil)
	post(t, gw.URL+"/v1/x", reqBody, nil).Body.Close()
	if o := sk.next(t); o.Input != "" || o.Output != "" {
		t.Errorf("bodies captured while disabled: %q / %d bytes", o.Input, len(o.Output))
	}

	gw2, sk2 := setup(t, up, func(o *Options) { o.CaptureBodies = true; o.CaptureMaxBytes = 100 })
	post(t, gw2.URL+"/v1/x", reqBody, nil).Body.Close()
	o := sk2.next(t)
	if o.Input != reqBody {
		t.Errorf("input = %q", o.Input)
	}
	if len(o.Output) != 100 {
		t.Errorf("output len = %d, want cap 100", len(o.Output))
	}
}
