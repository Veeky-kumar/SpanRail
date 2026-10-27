// Package metrics exposes the gateway's own health and performance in Prometheus format.
package metrics

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/veeky-ai/spanrail-gateway/internal/nettrace"
)

// Metrics owns a private registry (not the global default), so tests can create many
// instances and the process exposes only what the gateway registers on purpose.
type Metrics struct {
	reg *prometheus.Registry

	requests    *prometheus.CounterVec
	connections *prometheus.CounterVec
	duration    prometheus.Histogram
	dns         prometheus.Histogram
	connect     prometheus.Histogram
	tls         prometheus.Histogram
	ttfb        prometheus.Histogram

	// Reporter health, updated by the report package.
	Dropped       prometheus.Counter
	FlushFailures prometheus.Counter
	EventsSent    prometheus.Counter
}

// 1 ms .. ~33 s, doubling: wide enough for a LAN hop and for a slow LLM completion.
var buckets = prometheus.ExponentialBuckets(0.001, 2, 16)

func New() *Metrics {
	const ns = "spanrail_gateway_"
	hist := func(name, help string) prometheus.Histogram {
		return prometheus.NewHistogram(prometheus.HistogramOpts{Name: ns + name, Help: help, Buckets: buckets})
	}
	m := &Metrics{
		reg: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: ns + "requests_total", Help: "Proxied requests by response status code (499 = client left, 502/504 = gateway-generated).",
		}, []string{"code"}),
		connections: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: ns + "upstream_connections_total", Help: "Requests by whether they reused a keep-alive connection to the upstream.",
		}, []string{"reused"}),
		duration: hist("request_duration_seconds", "Total time to serve a proxied request."),
		dns:      hist("upstream_dns_seconds", "DNS lookup time (only when a lookup happened)."),
		connect:  hist("upstream_connect_seconds", "TCP connect time (only on new connections)."),
		tls:      hist("upstream_tls_seconds", "TLS handshake time (only on new TLS connections)."),
		ttfb:     hist("upstream_ttfb_seconds", "Time from starting the upstream round trip to its first response byte."),
		Dropped: prometheus.NewCounter(prometheus.CounterOpts{
			Name: ns + "report_dropped_total", Help: "Observations dropped because the report queue was full or closed.",
		}),
		FlushFailures: prometheus.NewCounter(prometheus.CounterOpts{
			Name: ns + "report_flush_failures_total", Help: "Event batches that could not be delivered to Spanrail after all retries.",
		}),
		EventsSent: prometheus.NewCounter(prometheus.CounterOpts{
			Name: ns + "report_events_sent_total", Help: "Events accepted by Spanrail.",
		}),
	}
	m.reg.MustRegister(m.requests, m.connections, m.duration, m.dns, m.connect, m.tls, m.ttfb,
		m.Dropped, m.FlushFailures, m.EventsSent)
	return m
}

// SetQueueDepth registers the queue-depth gauge. f is called on every scrape.
func (m *Metrics) SetQueueDepth(f func() float64) {
	m.reg.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "spanrail_gateway_report_queue_depth", Help: "Observations waiting to be reported.",
	}, f))
}

// ObserveRequest records one finished request. Phases that were not measured are skipped,
// so a histogram's count is the number of times that phase really happened.
func (m *Metrics) ObserveRequest(status int, total time.Duration, t nettrace.Snapshot) {
	m.requests.WithLabelValues(strconv.Itoa(status)).Inc()
	m.duration.Observe(total.Seconds())
	for _, p := range []struct {
		h prometheus.Histogram
		d *time.Duration
	}{{m.dns, t.DNS}, {m.connect, t.Connect}, {m.tls, t.TLS}, {m.ttfb, t.TTFB}} {
		if p.d != nil {
			p.h.Observe(p.d.Seconds())
		}
	}
	// Only requests that obtained a connection can be classified as new or reused.
	if t.ConnReused != nil {
		m.connections.WithLabelValues(strconv.FormatBool(*t.ConnReused)).Inc()
	}
}

// Value returns the current value of an unlabelled counter or gauge by metric name. It exists
// so tests can read a metric without scraping text. It is not used by the gateway itself.
func (m *Metrics) Value(name string) (float64, error) {
	families, err := m.reg.Gather()
	if err != nil {
		return 0, err
	}
	for _, f := range families {
		if f.GetName() != name {
			continue
		}
		var sum float64
		for _, mt := range f.GetMetric() {
			switch {
			case mt.Counter != nil:
				sum += mt.Counter.GetValue()
			case mt.Gauge != nil:
				sum += mt.Gauge.GetValue()
			}
		}
		return sum, nil
	}
	return 0, fmt.Errorf("metric %q not found", name)
}

// Handler serves the metrics for Prometheus to scrape.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{})
}
