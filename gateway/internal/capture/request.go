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
	Model  string
	Stream bool
	Prefix []byte // up to the peek limit; the full body if it was smaller
}

// PeekRequest reads at most limit bytes of r.Body to find the top-level "model" and
// "stream" fields, then replaces r.Body so the upstream still receives every byte, in
// order. Only the prefix is held in memory; the rest streams straight through.
//
// A read error does not fail the peek: it is replayed after the prefix, so the upstream
// sees the same failure the client caused.
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

	info.Model, info.Stream = scanTopLevel(prefix)
	return info, nil
}

// scanTopLevel walks the top-level keys of a possibly truncated JSON object, stopping at the
// first thing it cannot parse. Whatever it found before that point is still valid.
func scanTopLevel(b []byte) (model string, stream bool) {
	dec := json.NewDecoder(bytes.NewReader(b))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return "", false
	}
	for dec.More() {
		kt, err := dec.Token()
		if err != nil {
			return
		}
		key, _ := kt.(string)
		switch key {
		case "model":
			var s string
			if dec.Decode(&s) != nil {
				return
			}
			if len(s) > maxModelLen {
				s = s[:maxModelLen]
			}
			model = s
		case "stream":
			var v bool
			if dec.Decode(&v) != nil {
				return
			}
			stream = v
		default:
			var skip json.RawMessage
			if dec.Decode(&skip) != nil {
				return
			}
		}
	}
	return
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }
