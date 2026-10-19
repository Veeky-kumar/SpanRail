// Command gateway is a reverse proxy for LLM provider APIs that reports each call to Tracewell.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/config"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
	"github.com/veeky-ai/tracewell-gateway/internal/proxy"
	"github.com/veeky-ai/tracewell-gateway/internal/server"
)

// logSink is a stand-in until the Tracewell reporter exists. It logs a summary only: never
// headers or bodies, so provider keys cannot reach the log.
type logSink struct{}

func (logSink) Enqueue(o observe.Observation) bool {
	log.Printf("call %s model=%q status=%d stream=%v bytes=%d usage=%v dur=%s",
		o.Name, o.Model, o.Status, o.Streaming, o.ResponseBytes, o.Usage, o.End.Sub(o.Start).Round(time.Millisecond))
	return true
}

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	observed := observe.Handler(proxy.New(cfg.Upstream, cfg.UpstreamTimeout), observe.Options{
		PeekBytes:       cfg.PeekBytes,
		ParseMaxBytes:   cfg.ParseMaxBytes,
		CaptureBodies:   cfg.CaptureBodies,
		CaptureMaxBytes: cfg.CaptureMaxBytes,
		CaptureHeaders:  cfg.CaptureHeaders,
		RedactHeaders:   cfg.RedactHeaders,
		Sink:            logSink{},
	})
	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: server.Handler(observed),
	}

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

	log.Print("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("shutdown: %v", err)
	}
}
