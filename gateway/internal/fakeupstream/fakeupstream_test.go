package fakeupstream

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func post(t *testing.T, srv *httptest.Server, body string, hdr map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/chat/completions", strings.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestNonStreamingReturnsUsage(t *testing.T) {
	srv := httptest.NewServer(Handler(Options{}))
	defer srv.Close()
	resp := post(t, srv, `{"model":"fake-1"}`, nil)
	defer resp.Body.Close()
	var v struct {
		Model string
		Usage map[string]int
	}
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatal(err)
	}
	if v.Model != "fake-1" || v.Usage["prompt_tokens"] != 11 || v.Usage["completion_tokens"] != 7 || v.Usage["total_tokens"] != 18 {
		t.Errorf("response = %+v", v)
	}
}

func TestStreamingUsageOnlyWhenRequested(t *testing.T) {
	srv := httptest.NewServer(Handler(Options{Chunks: 3}))
	defer srv.Close()

	count := func(body string) (chunks int, hasUsage bool) {
		resp := post(t, srv, body, nil)
		defer resp.Body.Close()
		if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
			t.Fatalf("content-type = %q", ct)
		}
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			line := sc.Text()
			if strings.HasPrefix(line, "data: {") {
				chunks++
				if strings.Contains(line, `"usage":{`) {
					hasUsage = true
				}
			}
		}
		return
	}
	// Like OpenAI: streamed usage appears only if the client asks for it.
	if n, u := count(`{"stream":true}`); n != 3 || u {
		t.Errorf("without include_usage: chunks=%d usage=%v", n, u)
	}
	if n, u := count(`{"stream":true,"stream_options":{"include_usage":true}}`); n != 4 || !u {
		t.Errorf("with include_usage: chunks=%d usage=%v", n, u)
	}
}

func TestForcedStatusAndLatency(t *testing.T) {
	srv := httptest.NewServer(Handler(Options{Latency: 60 * time.Millisecond}))
	defer srv.Close()

	start := time.Now()
	resp := post(t, srv, `{}`, map[string]string{"X-Fake-Status": "503"})
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 503 {
		t.Errorf("status = %d", resp.StatusCode)
	}
	if time.Since(start) < 60*time.Millisecond {
		t.Errorf("latency not applied: %v", time.Since(start))
	}
}

func TestModelsEndpoint(t *testing.T) {
	srv := httptest.NewServer(Handler(Options{}))
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
