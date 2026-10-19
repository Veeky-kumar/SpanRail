package capture

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
)

const maxModelLen = 256

// RequestInfo is what the gateway learned by peeking at the start of a request body.
type RequestInfo struct {
	Model  string // empty if not found in the peeked prefix
	Prefix []byte // up to the peek limit; the full body if it was smaller
}

// PeekRequest reads at most limit bytes of r.Body to find the top-level "model" field,
// then replaces r.Body so the upstream still receives every byte, in order. Only the
// prefix is held in memory; the rest streams straight through.
//
// If reading fails part-way, the bytes read so far are still returned in info and the same
// error is replayed after them to the upstream, so it sees the failure the client caused.
// The error is also returned so the caller can decide what to do with the connection.
func PeekRequest(r *http.Request, limit int64) (RequestInfo, error) {
	var info RequestInfo
	if r.Body == nil || r.Body == http.NoBody {
		return info, nil
	}
	orig := r.Body
	prefix, readErr := io.ReadAll(io.LimitReader(orig, limit))
	info.Prefix = prefix

	var rest io.Reader = orig
	if readErr != nil {
		rest = errReader{readErr}
	}
	r.Body = struct {
		io.Reader
		io.Closer
	}{io.MultiReader(bytes.NewReader(prefix), rest), orig}

	info.Model = scanModel(prefix)
	return info, readErr
}

// scanModel walks the top-level keys of a possibly truncated JSON object looking for
// "model", stopping at the first thing it cannot parse. It finds the key only if it appears
// inside the prefix: clients such as openai-python put "messages" first, so for a very long
// prompt the model can lie beyond the peek window (the response is the fallback then).
func scanModel(b []byte) (model string) {
	dec := json.NewDecoder(bytes.NewReader(b))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return ""
	}
	for dec.More() {
		kt, err := dec.Token()
		if err != nil {
			return ""
		}
		if key, _ := kt.(string); key == "model" {
			var s string
			if dec.Decode(&s) != nil {
				return ""
			}
			return truncateModel(s)
		}
		var skip json.RawMessage
		if dec.Decode(&skip) != nil {
			return ""
		}
	}
	return ""
}

func truncateModel(s string) string {
	if len(s) > maxModelLen {
		return s[:maxModelLen]
	}
	return s
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

// ClientBodyError marks a failure while reading the *client's* request body (a stall, a reset
// connection). It lets the proxy answer 408/400 instead of blaming the upstream for a problem
// the upstream never saw.
type ClientBodyError struct{ Err error }

func (e *ClientBodyError) Error() string { return "reading client request body: " + e.Err.Error() }
func (e *ClientBodyError) Unwrap() error { return e.Err }
