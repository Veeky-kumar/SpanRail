package proxy

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// With many concurrent callers the gateway must keep enough idle connections to the upstream
// to reuse them. Go's DefaultTransport keeps only 2 per host, which at concurrency 16 means
// most requests pay for a new TCP (and, to a real provider, TLS) handshake and the machine
// can run out of ephemeral ports.
func TestUpstreamConnectionsAreReusedUnderConcurrency(t *testing.T) {
	var newConns atomic.Int64
	up := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(20 * time.Millisecond) // overlap the requests so they really are concurrent
		_, _ = io.WriteString(w, "ok")
	}))
	up.Config.ConnState = func(_ net.Conn, s http.ConnState) {
		if s == http.StateNew {
			newConns.Add(1)
		}
	}
	up.Start()
	defer up.Close()

	u, _ := url.Parse(up.URL)
	gw := httptest.NewServer(New(u, 5*time.Second))
	defer gw.Close()
	// A dedicated client per round trip would hide the effect, so share one keep-alive client.
	client := &http.Client{Transport: &http.Transport{MaxIdleConnsPerHost: 64}}

	const conc, rounds = 16, 4
	for r := 0; r < rounds; r++ {
		var wg sync.WaitGroup
		for i := 0; i < conc; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				resp, err := client.Get(gw.URL)
				if err != nil {
					t.Error(err)
					return
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}()
		}
		wg.Wait()
		time.Sleep(30 * time.Millisecond) // let connections return to the idle pool
	}

	// 16 are needed for the first round; later rounds should reuse them.
	if got := newConns.Load(); got > conc+4 {
		t.Errorf("gateway opened %d upstream connections for %d rounds of %d concurrent requests; want about %d (connections are not being reused)",
			got, rounds, conc, conc)
	}
}
