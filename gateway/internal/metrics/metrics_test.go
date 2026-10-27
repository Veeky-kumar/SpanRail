package metrics

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/veeky-ai/spanrail-gateway/internal/nettrace"
)

func scrape(t *testing.T, m *Metrics) string {
	t.Helper()
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	b, _ := io.ReadAll(rec.Result().Body)
	return string(b)
}

func want(t *testing.T, body string, lines ...string) {
	t.Helper()
	for _, l := range lines {
		if !strings.Contains(body, l) {
			t.Errorf("missing %q in:\n%s", l, body)
		}
	}
}

func TestObserveRequestCountsByStatusAndRecordsPhases(t *testing.T) {
	m := New()
	d := func(v time.Duration) *time.Duration { return &v }

	m.ObserveRequest(200, 300*time.Millisecond, nettrace.Snapshot{
		DNS: d(2 * time.Millisecond), Connect: d(5 * time.Millisecond),
		TLS: d(20 * time.Millisecond), TTFB: d(100 * time.Millisecond), ConnReused: boolPtr(false),
	})
	m.ObserveRequest(200, 10*time.Millisecond, nettrace.Snapshot{ConnReused: boolPtr(true), TTFB: d(8 * time.Millisecond)})
	m.ObserveRequest(502, time.Millisecond, nettrace.Snapshot{})

	body := scrape(t, m)
	want(t, body,
		`spanrail_gateway_requests_total{code="200"} 2`,
		`spanrail_gateway_requests_total{code="502"} 1`,
		`spanrail_gateway_request_duration_seconds_count 3`,
		// Phases are only observed when measured: DNS/connect/TLS once, TTFB twice.
		`spanrail_gateway_upstream_dns_seconds_count 1`,
		`spanrail_gateway_upstream_connect_seconds_count 1`,
		`spanrail_gateway_upstream_tls_seconds_count 1`,
		`spanrail_gateway_upstream_ttfb_seconds_count 2`,
		`spanrail_gateway_upstream_connections_total{reused="true"} 1`,
		`spanrail_gateway_upstream_connections_total{reused="false"} 1`,
	)
}

func TestReporterMetrics(t *testing.T) {
	m := New()
	m.Dropped.Inc()
	m.Dropped.Inc()
	m.FlushFailures.Inc()
	m.EventsSent.Add(7)
	depth := 3.0
	m.SetQueueDepth(func() float64 { return depth })

	want(t, scrape(t, m),
		`spanrail_gateway_report_dropped_total 2`,
		`spanrail_gateway_report_flush_failures_total 1`,
		`spanrail_gateway_report_events_sent_total 7`,
		`spanrail_gateway_report_queue_depth 3`,
	)
	depth = 9
	want(t, scrape(t, m), `spanrail_gateway_report_queue_depth 9`)
}

func TestNewRegistersOnPrivateRegistry(t *testing.T) {
	// Two instances must not collide (they would on the global default registry).
	New()
	New()
}

func boolPtr(b bool) *bool { return &b }
