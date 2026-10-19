// Package fakeupstream is a stand-in for an OpenAI-compatible provider. It lets the gateway
// be tested, demoed and benchmarked without a paid API key or network access.
//
// It copies the parts of OpenAI's behaviour the gateway depends on: JSON responses carry
// a usage object, and a streamed response carries usage only when the client sets
// stream_options.include_usage.
package fakeupstream

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Options shapes the fake's behaviour.
type Options struct {
	Latency    time.Duration // delay before the first byte
	ChunkDelay time.Duration // delay between streamed chunks
	Chunks     int           // content chunks in a streamed reply (default 5)
}

// Handler serves POST /v1/chat/completions and GET /v1/models. A request header
// X-Fake-Status makes the chat endpoint answer with that status instead.
func Handler(o Options) http.Handler {
	if o.Chunks <= 0 {
		o.Chunks = 5
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/models", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"object":"list","data":[{"id":"fake-1","object":"model"}]}`)
	})
	mux.HandleFunc("POST /v1/chat/completions", func(w http.ResponseWriter, r *http.Request) { chat(o, w, r) })
	return mux
}

func chat(o Options, w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model         string `json:"model"`
		Stream        bool   `json:"stream"`
		StreamOptions struct {
			IncludeUsage bool `json:"include_usage"`
		} `json:"stream_options"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // an unparseable body just gets defaults
	if req.Model == "" {
		req.Model = "fake-1"
	}

	if !sleep(r, o.Latency) {
		return
	}
	if s := r.Header.Get("X-Fake-Status"); s != "" {
		if code, err := strconv.Atoi(s); err == nil && code >= 100 && code < 600 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(code)
			_, _ = io.WriteString(w, `{"error":{"message":"forced by X-Fake-Status"}}`)
			return
		}
	}

	const usage = `{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}`
	if !req.Stream {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"chatcmpl-fake","object":"chat.completion","model":%q,`+
			`"choices":[{"index":0,"message":{"role":"assistant","content":"Hello from the fake upstream."},"finish_reason":"stop"}],`+
			`"usage":%s}`, req.Model, usage)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	flush := func() { _ = http.NewResponseController(w).Flush() }
	for i := 0; i < o.Chunks; i++ {
		fmt.Fprintf(w, "data: {\"id\":\"chatcmpl-fake\",\"model\":%q,\"choices\":[{\"index\":%d,\"delta\":{\"content\":\"tok%d \"}}]}\n\n", req.Model, 0, i)
		flush()
		if !sleep(r, o.ChunkDelay) {
			return
		}
	}
	if req.StreamOptions.IncludeUsage {
		fmt.Fprintf(w, "data: {\"id\":\"chatcmpl-fake\",\"model\":%q,\"choices\":[],\"usage\":%s}\n\n", req.Model, usage)
		flush()
	}
	_, _ = io.WriteString(w, "data: [DONE]\n\n")
	flush()
}

// sleep waits d, returning false if the client went away first.
func sleep(r *http.Request, d time.Duration) bool {
	if d <= 0 {
		return true
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-r.Context().Done():
		return false
	}
}
