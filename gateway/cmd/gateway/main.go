// Command gateway is a reverse proxy for LLM provider APIs that reports each call to Tracewell.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/config"
	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
	"github.com/veeky-ai/tracewell-gateway/internal/proxy"
	"github.com/veeky-ai/tracewell-gateway/internal/report"
	"github.com/veeky-ai/tracewell-gateway/internal/server"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	m := metrics.New()
	opts := observe.Options{
		PeekBytes:       cfg.PeekBytes,
		PeekTimeout:     cfg.PeekTimeout,
		ParseMaxBytes:   cfg.ParseMaxBytes,
		CaptureBodies:   cfg.CaptureBodies,
		CaptureMaxBytes: cfg.CaptureMaxBytes,
		CaptureHeaders:  cfg.CaptureHeaders,
		RedactHeaders:   cfg.RedactHeaders,
		Metrics:         m,
	}

	var reporter *report.Reporter
	if cfg.ReportEnabled {
		sender := report.NewHTTPSender(cfg.TracewellURL, cfg.PublicKey, string(cfg.SecretKey), cfg.ReportTimeout)
		reporter = report.New(report.Config{
			QueueSize:     cfg.QueueSize,
			BatchSize:     cfg.BatchSize,
			Workers:       cfg.ReportWorkers,
			FlushInterval: cfg.FlushInterval,
			MaxAttempts:   cfg.ReportMaxAttempts,
			BaseBackoff:   250 * time.Millisecond,
			MaxBackoff:    10 * time.Second,
		}, sender, m)
		m.SetQueueDepth(reporter.QueueDepth)
		opts.Sink = reporter
		log.Printf("reporting to %s", cfg.TracewellURL.Redacted())
	} else {
		log.Print("reporting disabled: running as a plain proxy")
	}

	var draining atomic.Bool
	srv := server.New(cfg.ListenAddr, server.Handler(
		observe.Handler(proxy.New(cfg.Upstream, cfg.UpstreamTimeout), opts),
		server.Ops{Metrics: m.Handler(), Ready: func() bool { return !draining.Load() }},
	))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	log.Printf("gateway listening on %s, upstream %s", cfg.ListenAddr, cfg.Upstream.Redacted())

	select {
	case err := <-errc:
		log.Fatalf("server error: %v", err)
	case <-ctx.Done():
	}

	// A second signal now kills the process the default way instead of being swallowed.
	stop()

	// Order matters. 1) turn /readyz to 503 and keep serving for DRAIN_DELAY so balancers see
	// it and stop sending traffic, 2) let in-flight requests finish (each may still enqueue an
	// observation), 3) only then flush the reporter, so nothing is enqueued after the final flush.
	log.Print("shutting down")
	draining.Store(true)
	time.Sleep(cfg.DrainDelay)
	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancelHTTP()
	if err := srv.Shutdown(httpCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("shutdown: %v", err)
	}
	if reporter != nil {
		flushCtx, cancelFlush := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancelFlush()
		if err := reporter.Close(flushCtx); err != nil {
			log.Printf("report flush incomplete: %v", err)
		}
	}
}
