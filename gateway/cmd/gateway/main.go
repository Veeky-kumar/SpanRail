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

	"github.com/veeky-ai/tracewell-gateway/internal/config"
	"github.com/veeky-ai/tracewell-gateway/internal/proxy"
	"github.com/veeky-ai/tracewell-gateway/internal/server"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: server.Handler(proxy.New(cfg.Upstream, cfg.UpstreamTimeout)),
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
