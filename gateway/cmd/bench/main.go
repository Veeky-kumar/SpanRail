// Command bench is a small closed-loop load generator that reports latency percentiles.
// It exists to measure the overhead the gateway adds, by running the same load directly
// against an upstream and again through the gateway. Development tool only.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

type result struct {
	Label    string  `json:"label"`
	Requests int     `json:"requests"`
	Errors   int     `json:"errors"`
	Conc     int     `json:"concurrency"`
	RPS      float64 `json:"rps"`
	MeanMs   float64 `json:"mean_ms"`
	P50Ms    float64 `json:"p50_ms"`
	P95Ms    float64 `json:"p95_ms"`
	P99Ms    float64 `json:"p99_ms"`
	MaxMs    float64 `json:"max_ms"`
}

func main() {
	url := flag.String("url", "http://127.0.0.1:9000/v1/chat/completions", "target URL")
	body := flag.String("body", `{"model":"bench","messages":[{"role":"user","content":"hello"}]}`, "request body")
	n := flag.Int("n", 10000, "measured requests")
	warm := flag.Int("warmup", 500, "unmeasured warm-up requests")
	c := flag.Int("c", 1, "concurrent workers")
	label := flag.String("label", "", "label for the output line")
	asJSON := flag.Bool("json", false, "print one JSON line instead of text")
	flag.Parse()

	client := &http.Client{Transport: &http.Transport{
		MaxIdleConns: *c * 2, MaxIdleConnsPerHost: *c * 2, // keep-alive, like a real SDK client
	}}
	do := func() (time.Duration, error) {
		req, _ := http.NewRequest(http.MethodPost, *url, bytes.NewReader([]byte(*body)))
		req.Header.Set("Content-Type", "application/json")
		start := time.Now()
		resp, err := client.Do(req)
		if err != nil {
			return 0, err
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return 0, fmt.Errorf("status %d", resp.StatusCode)
		}
		return time.Since(start), nil
	}

	run := func(total int) ([]time.Duration, int, time.Duration) {
		var mu sync.Mutex
		var wg sync.WaitGroup
		lat := make([]time.Duration, 0, total)
		errs := 0
		jobs := make(chan struct{}, total)
		for i := 0; i < total; i++ {
			jobs <- struct{}{}
		}
		close(jobs)
		start := time.Now()
		for w := 0; w < *c; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for range jobs {
					d, err := do()
					mu.Lock()
					if err != nil {
						errs++
					} else {
						lat = append(lat, d)
					}
					mu.Unlock()
				}
			}()
		}
		wg.Wait()
		return lat, errs, time.Since(start)
	}

	run(*warm)
	lat, errs, elapsed := run(*n)
	if len(lat) == 0 {
		log.Fatalf("no successful requests (%d errors)", errs)
	}
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	pct := func(p float64) float64 {
		i := int(float64(len(lat)-1) * p)
		return float64(lat[i].Microseconds()) / 1000
	}
	var sum time.Duration
	for _, d := range lat {
		sum += d
	}
	r := result{
		Label: *label, Requests: len(lat), Errors: errs, Conc: *c,
		RPS:    float64(len(lat)) / elapsed.Seconds(),
		MeanMs: float64(sum.Microseconds()) / 1000 / float64(len(lat)),
		P50Ms:  pct(0.50), P95Ms: pct(0.95), P99Ms: pct(0.99),
		MaxMs: float64(lat[len(lat)-1].Microseconds()) / 1000,
	}
	if *asJSON {
		_ = json.NewEncoder(os.Stdout).Encode(r)
		return
	}
	fmt.Printf("%-28s c=%-3d n=%d err=%d  rps=%.0f  mean=%.3fms p50=%.3fms p95=%.3fms p99=%.3fms max=%.3fms\n",
		r.Label, r.Conc, r.Requests, r.Errors, r.RPS, r.MeanMs, r.P50Ms, r.P95Ms, r.P99Ms, r.MaxMs)
}
