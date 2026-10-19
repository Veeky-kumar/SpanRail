package observe

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/capture"
	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
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

func TestTimingsAndMetricsAreRecorded(t *testing.T) {
	m := metrics.New()
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		_, _ = io.WriteString(w, "{}")
	}), func(o *Options) { o.Metrics = m })

	post(t, gw.URL+"/v1/x", `{}`, nil).Body.Close()
	resp, err := http.Get(gw.URL + "/v1/models") // GET is counted in metrics even though it is not reported
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	o := sk.next(t)
	if o.Timings == nil || o.Timings.TTFB == nil || *o.Timings.TTFB < 50*time.Millisecond {
		t.Fatalf("timings = %+v, want TTFB >= 50ms", o.Timings)
	}
	// Metrics are recorded after the response is written, so the client can see a request
	// finish a moment before it is counted. Wait for the count rather than assume it.
	var body string
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
		rec := httptest.NewRecorder()
		m.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
		body = rec.Body.String()
		if strings.Contains(body, `tracewell_gateway_requests_total{code="200"} 2`) {
			return
		}
	}
	t.Errorf("both requests should be counted:\n%s", body)
}

func TestTraceHeadersAttachToExistingTraceAndAreNotForwarded(t *testing.T) {
	var seen http.Header
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen = r.Header.Clone() }), nil)

	post(t, gw.URL+"/v1/x", `{}`, map[string]string{
		"X-Tracewell-Trace-Id":              "trace-123",
		"X-Tracewell-Parent-Observation-Id": "span_9.a:b",
		"X-Tracewell-Anything":              "x",
	}).Body.Close()

	o := sk.next(t)
	if o.TraceID != "trace-123" || o.ParentObservationID != "span_9.a:b" {
		t.Errorf("trace=%q parent=%q", o.TraceID, o.ParentObservationID)
	}
	for k := range seen {
		if strings.HasPrefix(strings.ToLower(k), "x-tracewell-") {
			t.Errorf("internal header %q leaked to the upstream provider", k)
		}
	}
}

func TestInvalidTraceHeadersAreIgnored(t *testing.T) {
	long := strings.Repeat("a", 129)
	tests := []struct {
		name, trace, parent string
		wantTrace, wantPar  string
	}{
		{"none", "", "", "", ""},
		{"trace only", "t1", "", "t1", ""},
		{"parent without trace is meaningless", "", "p1", "", ""},
		{"space in trace", "has space", "p1", "", ""},
		{"too long trace", long, "", "", ""},
		{"unicode trace", "träce", "", "", ""},
		{"bad parent keeps the trace", "t1", "bad parent", "t1", ""},
		{"quote and brace", `t"}`, "", "", ""},
	}
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}), nil)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hdr := map[string]string{}
			if tt.trace != "" {
				hdr["X-Tracewell-Trace-Id"] = tt.trace
			}
			if tt.parent != "" {
				hdr["X-Tracewell-Parent-Observation-Id"] = tt.parent
			}
			post(t, gw.URL+"/v1/x", `{}`, hdr).Body.Close()
			o := sk.next(t)
			if o.TraceID != tt.wantTrace || o.ParentObservationID != tt.wantPar {
				t.Errorf("got trace=%q parent=%q, want %q %q", o.TraceID, o.ParentObservationID, tt.wantTrace, tt.wantPar)
			}
		})
	}
}

// httputil.ReverseProxy panics with http.ErrAbortHandler when it cannot finish copying a
// response (client left mid-stream). The call must still be recorded.
func TestClientDisconnectMidStreamIsStillReported(t *testing.T) {
	m := metrics.New()
	release := make(chan struct{})
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[]}\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}), func(o *Options) { o.Metrics = m })
	defer close(release)

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, gw.URL+"/v1/chat/completions", strings.NewReader(`{"model":"m","stream":true}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 5)
	if _, err := io.ReadFull(resp.Body, buf); err != nil {
		t.Fatal(err)
	}
	cancel() // client walks away mid-stream
	resp.Body.Close()

	o := sk.next(t)
	if o.Model != "m" || !o.Streaming {
		t.Errorf("interrupted call not reported correctly: %+v", o)
	}
}

func TestModelFallsBackToTheResponseWhenTheRequestPrefixHidesIt(t *testing.T) {
	// "model" comes after a body larger than the peek window, as openai-python orders it.
	big := `{"messages":[{"role":"user","content":"` + strings.Repeat("a", 6000) + `"}],"model":"req-model"}`

	gwJSON, skJSON := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"model":"resolved-model-2026","usage":{"prompt_tokens":1}}`)
	}), nil) // PeekBytes is 4096 in setup
	post(t, gwJSON.URL+"/v1/x", big, nil).Body.Close()
	if o := skJSON.next(t); o.Model != "resolved-model-2026" {
		t.Errorf("json: model = %q", o.Model)
	}

	gwSSE, skSSE := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"model\":\"stream-model\",\"choices\":[]}\n\ndata: [DONE]\n\n")
	}), nil)
	post(t, gwSSE.URL+"/v1/x", big, nil).Body.Close()
	if o := skSSE.next(t); o.Model != "stream-model" {
		t.Errorf("sse: model = %q", o.Model)
	}

	// When the request names the model, that wins over the response.
	gw3, sk3 := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"model":"resolved"}`)
	}), nil)
	post(t, gw3.URL+"/v1/x", `{"model":"asked-for"}`, nil).Body.Close()
	if o := sk3.next(t); o.Model != "asked-for" {
		t.Errorf("request model should win, got %q", o.Model)
	}
}

func TestUnparseableResponsesAreNotHeldInMemory(t *testing.T) {
	chunk := bytes.Repeat([]byte("a"), 64<<10)
	for _, tc := range []struct {
		name       string
		ctype, enc string
		capture    bool
		wantAtMost int
	}{
		{"audio, capture off", "audio/mpeg", "", false, 0},
		{"brotli json, capture off", "application/json", "br", false, 0},
		{"audio, capture on is capped", "audio/mpeg", "", true, 100},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := newRecorder(httptest.NewRecorder(), Options{ParseMaxBytes: 1 << 20, CaptureBodies: tc.capture, CaptureMaxBytes: 100}, true)
			rec.Header().Set("Content-Type", tc.ctype)
			if tc.enc != "" {
				rec.Header().Set("Content-Encoding", tc.enc)
			}
			rec.WriteHeader(200)
			for i := 0; i < 80; i++ { // 5 MiB
				_, _ = rec.Write(chunk)
			}
			if rec.buf.Len() > tc.wantAtMost {
				t.Errorf("buffered %d bytes, want at most %d", rec.buf.Len(), tc.wantAtMost)
			}
			if rec.bytes != int64(80*len(chunk)) {
				t.Errorf("size accounting broken: %d", rec.bytes)
			}
		})
	}
}

func TestStalledRequestBodyDoesNotHangTheGateway(t *testing.T) {
	gw, _ := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
	}), func(o *Options) { o.PeekTimeout = 150 * time.Millisecond })

	conn, err := net.Dial("tcp", strings.TrimPrefix(gw.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// Promise 1000 bytes, send 10, then go silent.
	_, _ = io.WriteString(conn, "POST /v1/x HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\n0123456789")
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	start := time.Now()
	_, err = io.ReadAll(conn)
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		t.Fatalf("gateway still waiting on the stalled client after %v", time.Since(start))
	}
}

// A slow link is not a stall: as long as bytes keep arriving, the request must go through.
func TestSlowButProgressingUploadSucceeds(t *testing.T) {
	var got string
	gw, _ := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got = string(b)
	}), func(o *Options) { o.PeekTimeout = 300 * time.Millisecond })

	body := `{"model":"slow","pad":"` + strings.Repeat("x", 28) + `"}` // 50 bytes
	conn, err := net.Dial("tcp", strings.TrimPrefix(gw.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = io.WriteString(conn, "POST /v1/x HTTP/1.1\r\nHost: x\r\nContent-Length: "+strconv.Itoa(len(body))+"\r\n\r\n")
	for i := 0; i < len(body); i += 5 { // 5 bytes every 120ms: 1.2s in total, well over the 300ms timeout
		end := min(i+5, len(body))
		_, _ = io.WriteString(conn, body[i:end])
		time.Sleep(120 * time.Millisecond)
	}
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 || got != body {
		t.Errorf("status=%d, upstream got %q (want the full %d-byte body)", resp.StatusCode, got, len(body))
	}
}

// After the prefix has been read, a client that stops sending must still be cut off.
func TestStallAfterThePeekIsCutOff(t *testing.T) {
	gw, _ := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Like a real provider: a truncated body is a client error.
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			http.Error(w, "truncated body", http.StatusBadRequest)
		}
	}), func(o *Options) { o.PeekTimeout = 200 * time.Millisecond; o.PeekBytes = 4 })

	conn, err := net.Dial("tcp", strings.TrimPrefix(gw.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = io.WriteString(conn, "POST /v1/x HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\n0123456789") // then silence
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	start := time.Now()
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatalf("no response %v after the client stalled: %v", time.Since(start), err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusRequestTimeout {
		t.Errorf("status = %d, want 408: the client stalled, which is not a success and not the upstream's fault", resp.StatusCode)
	}
}

func TestReportedPathIsCapped(t *testing.T) {
	gw, sk := setup(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}), nil)
	post(t, gw.URL+"/v1/"+strings.Repeat("a", 6000), `{}`, nil).Body.Close()
	o := sk.next(t)
	if len(o.Path) > 256 || len(o.Name) > 80 {
		t.Errorf("path %d bytes, name %d bytes; a caller-controlled path must not bloat the events sent to Tracewell", len(o.Path), len(o.Name))
	}
}

type hijackableWriter struct{ *httptest.ResponseRecorder }

func (hijackableWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	c, _ := net.Pipe()
	return c, nil, nil
}

func TestHijackedUpgradeIsRecordedAs101NotClientClosed(t *testing.T) {
	rec := newRecorder(hijackableWriter{httptest.NewRecorder()}, Options{}, true)
	conn, _, err := http.NewResponseController(rec).Hijack()
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()
	if rec.status != http.StatusSwitchingProtocols {
		t.Errorf("status = %d, want 101 (ReverseProxy hijacks for Upgrade responses without calling WriteHeader)", rec.status)
	}
}

// A compressed event stream is binary to the line scanner; reading it would find nothing and
// capturing it would store mangled bytes. It must be treated as unreadable (usage unknown).
func TestCompressedStreamIsNotScannedOrCaptured(t *testing.T) {
	rec := newRecorder(httptest.NewRecorder(), Options{ParseMaxBytes: 1 << 20, CaptureBodies: true, CaptureMaxBytes: 100}, true)
	rec.Header().Set("Content-Type", "text/event-stream")
	rec.Header().Set("Content-Encoding", "gzip")
	rec.WriteHeader(200)
	_, _ = rec.Write([]byte("\x1f\x8b\x08binary-looking-bytes-data:{\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":9}}\n"))
	usage, model := rec.result()
	if usage != nil || model != "" {
		t.Errorf("usage=%v model=%q from a compressed stream", usage, model)
	}
	if !rec.sse {
		t.Error("it is still a stream and should be reported as streaming")
	}
	if len(rec.outputBytes()) != 0 {
		t.Errorf("captured %d bytes of compressed stream", len(rec.outputBytes()))
	}
}
