// Package faketracewell is a minimal stand-in for Tracewell's ingestion endpoint. It accepts
// every event and counts them, so the gateway's own throughput can be measured without the
// real database and worker behind it. It is a development tool, not part of the gateway image.
package faketracewell

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

// Sink counts what it receives.
type Sink struct {
	Delay time.Duration // artificial processing time per request

	mu       sync.Mutex
	requests int
	byType   map[string]int
}

// Handler serves POST /api/public/ingestion and GET /stats.
func (s *Sink) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/public/ingestion", s.ingest)
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"requests": s.requests, "events": s.byType})
	})
	return mux
}

func (s *Sink) ingest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Batch []struct {
			Type string `json:"type"`
			Body struct {
				ID string `json:"id"`
			} `json:"body"`
		} `json:"batch"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	_, _ = io.Copy(io.Discard, r.Body)
	if s.Delay > 0 {
		time.Sleep(s.Delay)
	}

	s.mu.Lock()
	if s.byType == nil {
		s.byType = map[string]int{}
	}
	s.requests++
	succ := make([]map[string]any, 0, len(body.Batch))
	for _, e := range body.Batch {
		s.byType[e.Type]++
		succ = append(succ, map[string]any{"id": e.Body.ID, "status": 201})
	}
	s.mu.Unlock()

	w.WriteHeader(http.StatusMultiStatus)
	_ = json.NewEncoder(w).Encode(map[string]any{"successes": succ, "errors": []any{}})
}

// Events returns the total number of events received.
func (s *Sink) Events() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, c := range s.byType {
		n += c
	}
	return n
}
