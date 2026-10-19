// Package observe wraps the proxy with a middleware that records what happened to each
// LLM call (model, status, size, token usage, ...) and hands it to a Sink, without
// altering or delaying the bytes flowing between client and upstream.
package observe

import (
	"net/http"
	"strings"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/capture"
	"github.com/veeky-ai/tracewell-gateway/internal/ids"
	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
	"github.com/veeky-ai/tracewell-gateway/internal/nettrace"
	"github.com/veeky-ai/tracewell-gateway/internal/redact"
)

// statusClientClosed is the (nginx-style) code recorded when the client went away before
// any response was written.
const statusClientClosed = 499

// Observation is everything the gateway knows about one proxied call.
type Observation struct {
	ID string // generation id
	// TraceID and ParentObservationID are set when the client asked to attach this call to an
	// existing trace; empty TraceID means the call starts a new trace.
	TraceID, ParentObservationID string

	Name   string
	Model  string
	Method string
	Path   string

	Start, End time.Time

	Status        int
	Streaming     bool
	ResponseBytes int64         // bytes sent to the client (wire size, i.e. compressed if gzip)
	Usage         capture.Usage // nil = unknown
	Timings       *nettrace.Snapshot

	Headers map[string]string // redacted request headers; nil unless CaptureHeaders
	Input   string            // request body prefix; empty unless CaptureBodies
	Output  string            // response body prefix; empty unless CaptureBodies
}

// Sink receives finished observations. Enqueue must not block; it reports whether the
// observation was accepted.
type Sink interface {
	Enqueue(Observation) bool
}

// Options configures the middleware.
type Options struct {
	PeekBytes       int64 // request-body prefix inspected for model/stream
	ParseMaxBytes   int64 // largest response held in memory to read usage from
	CaptureBodies   bool
	CaptureMaxBytes int // cap on Input/Output when CaptureBodies is on
	CaptureHeaders  bool
	RedactHeaders   []string // extra header names to redact (a built-in list is always applied)
	Sink            Sink
	Metrics         *metrics.Metrics // optional
	Now             func() time.Time // defaults to time.Now
}

// Handler returns next wrapped with observation. Every request is timed and counted in
// metrics; only POST requests are inspected and reported, since listing models is not an
// LLM call.
func Handler(next http.Handler, o Options) http.Handler {
	now := o.Now
	if now == nil {
		now = time.Now
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Every request is timed and counted; only POSTs (LLM calls) are inspected and reported.
		report := r.Method == http.MethodPost && o.Sink != nil

		start := now()
		timings := nettrace.New()
		r = r.WithContext(nettrace.With(r.Context(), timings))

		var info capture.RequestInfo
		var hdr map[string]string
		if report {
			info, _ = capture.PeekRequest(r, o.PeekBytes) // a read error replays to the upstream
			if o.CaptureHeaders {
				hdr = redact.Headers(r.Header, o.RedactHeaders)
			}
		}
		rec := newRecorder(w, o, report)
		next.ServeHTTP(rec, r)

		end := now()
		status := rec.status
		if status == 0 {
			status = statusClientClosed
		}
		snap := timings.Snapshot()
		if o.Metrics != nil {
			o.Metrics.ObserveRequest(status, end.Sub(start), snap)
		}
		if !report {
			return
		}

		obs := Observation{
			ID:            ids.New(),
			Name:          nameFromPath(r.URL.Path),
			Model:         info.Model,
			Method:        r.Method,
			Path:          r.URL.Path,
			Start:         start,
			End:           end,
			Status:        status,
			Streaming:     rec.sse,
			ResponseBytes: rec.bytes,
			Usage:         rec.usage(),
			Timings:       &snap,
			Headers:       hdr,
		}
		if o.CaptureBodies {
			obs.Input = truncate(info.Prefix, o.CaptureMaxBytes)
			obs.Output = truncate(rec.outputBytes(), o.CaptureMaxBytes)
		}
		o.Sink.Enqueue(obs)
	})
}

// nameFromPath turns /v1/chat/completions into chat.completions.
func nameFromPath(p string) string {
	p = strings.Trim(strings.TrimPrefix(strings.TrimPrefix(p, "/"), "v1/"), "/")
	if p == "" {
		return "request"
	}
	if len(p) > 80 {
		p = p[:80]
	}
	return strings.ReplaceAll(p, "/", ".")
}

func truncate(b []byte, max int) string {
	if len(b) > max {
		b = b[:max]
	}
	return strings.ToValidUTF8(string(b), "")
}
