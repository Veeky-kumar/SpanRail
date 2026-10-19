package observe

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/veeky-ai/tracewell-gateway/internal/capture"
)

// maxDecompressed bounds how much a gzip response may expand while we read its usage, so a
// hostile or buggy upstream cannot make the gateway allocate without limit.
const maxDecompressed = 8 << 20

// maxSSELine bounds a single SSE line the usage scanner will buffer.
const maxSSELine = 1 << 20

// recorder is an http.ResponseWriter that passes everything straight through to the real
// writer and keeps a bounded side copy for inspection. It never delays or changes a write.
type recorder struct {
	http.ResponseWriter

	status      int
	bytes       int64
	wroteHeader bool

	contentType, contentEncoding string
	sse                          bool
	scanner                      *capture.SSEUsageScanner

	buf       bytes.Buffer
	limit     int64 // how much of the body to keep
	keep      int64 // replaces limit once the response turns out not to be worth parsing
	truncated bool
	noScan    bool // size/status only; no copy, no usage parsing
}

// newRecorder wraps w. With inspect false it only tracks status and size and keeps no copy.
func newRecorder(w http.ResponseWriter, o Options, inspect bool) *recorder {
	r := &recorder{ResponseWriter: w}
	if !inspect {
		r.noScan = true
		return r
	}
	r.limit = o.ParseMaxBytes
	// Streams and responses we cannot parse are not worth holding in memory: keep a copy of
	// them only if bodies are being captured, and then only up to the capture cap.
	if o.CaptureBodies {
		r.keep = int64(o.CaptureMaxBytes)
	}
	return r
}

func (r *recorder) WriteHeader(code int) {
	// 1xx interim responses (100 Continue, 103 Early Hints) are not the final status.
	if code >= 100 && code < 200 && code != http.StatusSwitchingProtocols {
		r.ResponseWriter.WriteHeader(code)
		return
	}
	if r.wroteHeader {
		return
	}
	r.wroteHeader = true
	r.status = code
	h := r.Header()
	r.contentType = strings.ToLower(h.Get("Content-Type"))
	r.contentEncoding = strings.ToLower(strings.TrimSpace(h.Get("Content-Encoding")))
	if !r.noScan {
		switch {
		case strings.HasPrefix(r.contentType, "text/event-stream"):
			r.sse = true
			r.scanner = capture.NewSSEUsageScanner(maxSSELine)
			r.limit = r.keep // scanned as it passes; no need to hold the stream
		case !r.parseable():
			r.limit = r.keep
		}
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(p []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(p)
	r.bytes += int64(n)
	if n > 0 && !r.noScan {
		r.observe(p[:n])
	}
	return n, err
}

func (r *recorder) observe(p []byte) {
	if r.sse {
		_, _ = r.scanner.Write(p)
	}
	if room := r.limit - int64(r.buf.Len()); room > 0 {
		if int64(len(p)) > room {
			r.buf.Write(p[:room])
			r.truncated = true
		} else {
			r.buf.Write(p)
		}
	} else if len(p) > 0 {
		r.truncated = true
	}
}

// Flush lets ReverseProxy push SSE chunks to the client immediately.
func (r *recorder) Flush() {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	http.NewResponseController(r.ResponseWriter).Flush() //nolint:errcheck // best effort, same as http.Flusher
}

// Unwrap exposes the underlying writer to http.ResponseController (hijack, deadlines).
func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// parseable reports whether the body is something we can read usage and model from.
func (r *recorder) parseable() bool {
	if !strings.Contains(r.contentType, "json") {
		return false
	}
	switch r.contentEncoding {
	case "", "identity", "gzip":
		return true
	}
	return false
}

// result returns the token usage (nil if unknown) and the model name the response reported
// (empty if none). The model is only a fallback for when the request prefix did not show it.
func (r *recorder) result() (capture.Usage, string) {
	if r.noScan {
		return nil, ""
	}
	if r.sse {
		return r.scanner.Usage(), r.scanner.Model()
	}
	if !r.parseable() {
		return nil, ""
	}
	body, ok := r.decodedBody()
	if !ok {
		return nil, ""
	}
	return capture.ParseUsageJSON(body), capture.ParseModelJSON(body)
}

// decodedBody returns the buffered response as plain bytes. ok is false when the body was
// cut off by the buffer limit or uses an encoding we do not decode.
func (r *recorder) decodedBody() ([]byte, bool) {
	if r.truncated {
		return nil, false
	}
	switch r.contentEncoding {
	case "", "identity":
		return r.buf.Bytes(), true
	case "gzip":
		zr, err := gzip.NewReader(bytes.NewReader(r.buf.Bytes()))
		if err != nil {
			return nil, false
		}
		out, err := io.ReadAll(io.LimitReader(zr, maxDecompressed+1))
		if err != nil || len(out) > maxDecompressed {
			return nil, false
		}
		return out, true
	default:
		return nil, false
	}
}

// outputBytes is the response body as readable text where possible (gzip is decoded).
func (r *recorder) outputBytes() []byte {
	if r.contentEncoding == "" || r.contentEncoding == "identity" || r.sse {
		return r.buf.Bytes()
	}
	if b, ok := r.decodedBody(); ok {
		return b
	}
	return nil
}
