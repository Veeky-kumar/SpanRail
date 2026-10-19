package report

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxResponseBytes = 1 << 20

// HTTPSender posts batches to Tracewell's public ingestion endpoint.
type HTTPSender struct {
	url    string
	auth   string
	client *http.Client
}

// NewHTTPSender targets base (e.g. http://localhost:3000) using the project's key pair.
// timeout bounds each attempt.
func NewHTTPSender(base *url.URL, publicKey, secretKey string, timeout time.Duration) *HTTPSender {
	return &HTTPSender{
		url:  base.JoinPath("api/public/ingestion").String(),
		auth: "Basic " + base64.StdEncoding.EncodeToString([]byte(publicKey+":"+secretKey)),
		client: &http.Client{
			Timeout: timeout,
			// Never follow redirects: a redirect must not carry our credentials anywhere else.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

type entryResult struct {
	ID      string `json:"id"`
	Status  int    `json:"status"`
	Message string `json:"message"`
}

// Send posts the batch once and classifies the outcome. The ingestion API answers 207 with a
// per-event status, so a 207 can still hide failures; those are sorted into retryable (5xx)
// and rejected (4xx).
func (s *HTTPSender) Send(ctx context.Context, events []Event) Result {
	body, err := json.Marshal(struct {
		Batch []Event `json:"batch"`
	}{events})
	if err != nil {
		return Result{Rejected: len(events), Err: fmt.Errorf("encode batch: %w", err)}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return Result{Rejected: len(events), Err: fmt.Errorf("build request: %w", err)}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", s.auth)

	resp, err := s.client.Do(req)
	if err != nil {
		// url.Error carries the URL but never request headers, so the key cannot appear here.
		return Result{Retry: events, Err: fmt.Errorf("send to tracewell: %w", err)}
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))

	switch {
	case resp.StatusCode == http.StatusMultiStatus:
		return classify207(events, data)
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return Result{Accepted: len(events)}
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusRequestTimeout ||
		resp.StatusCode == http.StatusTooEarly || resp.StatusCode >= 500:
		// Transient, including a 408/425 from a proxy in front of Tracewell; retrying is safe
		// because ingestion is idempotent per event id.
		return Result{Retry: events, Err: fmt.Errorf("tracewell responded %d", resp.StatusCode)}
	default: // 3xx (not followed), 400, 401, 403, 413, ...: the same request will fail again
		return Result{Rejected: len(events), Err: fmt.Errorf("tracewell rejected batch with %d: %s", resp.StatusCode, snippet(data))}
	}
}

func classify207(events []Event, data []byte) Result {
	var parsed struct {
		Errors []entryResult `json:"errors"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		// We cannot tell what was stored. Retrying is safe: ingestion is idempotent per event id.
		return Result{Retry: events, Err: errors.New("tracewell returned an unreadable 207 body")}
	}

	// Validation failures are reported by event id, storage failures by entity (body) id.
	byEvent := map[string]int{}
	byEntity := map[string][]int{}
	for i, e := range events {
		byEvent[e.ID] = i
		if id, ok := e.Body["id"].(string); ok {
			byEntity[id] = append(byEntity[id], i)
		}
	}
	const (
		failNone = iota
		failRejected
		failRetry
	)
	state := make([]int, len(events))
	var firstMsg string
	var unmatchedRetry, unmatchedReject int // errors that name nothing in this batch
	for _, er := range parsed.Errors {
		var hit []int
		if i, ok := byEvent[er.ID]; ok {
			hit = []int{i}
		} else {
			hit = byEntity[er.ID]
		}
		class := failRejected
		if er.Status >= 500 || er.Status == http.StatusTooManyRequests {
			class = failRetry
		}
		if len(hit) == 0 {
			if class == failRetry {
				unmatchedRetry++
			} else {
				unmatchedReject++
			}
		}
		for _, i := range hit {
			state[i] = max(state[i], class) // retry wins if an event is named twice
		}
		if firstMsg == "" {
			firstMsg = fmt.Sprintf("%d %s", er.Status, er.Message)
		}
	}

	// An error that matches no event in the batch cannot be attributed, but it must not be
	// silently counted as success. If it is retryable we cannot tell which events were stored,
	// so retry every one not already rejected (safe: ingestion is idempotent per event id).
	if unmatchedRetry > 0 {
		for i, st := range state {
			if st == failNone {
				state[i] = failRetry
			}
		}
	}

	var res Result
	for i, st := range state {
		switch st {
		case failNone:
			res.Accepted++
		case failRejected:
			res.Rejected++
		case failRetry:
			res.Retry = append(res.Retry, events[i])
		}
	}
	// Unattributable rejections: take them out of the accepted count, one per error entry.
	if take := min(unmatchedReject, res.Accepted); take > 0 {
		res.Accepted -= take
		res.Rejected += take
	}
	if res.Rejected > 0 || len(res.Retry) > 0 {
		res.Err = fmt.Errorf("tracewell reported per-event errors (first: %s)", snippet([]byte(firstMsg)))
	}
	return res
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return s
}
