// Command faketracewell is a counting stand-in for Tracewell's ingestion API, used to measure
// the gateway's throughput in isolation and to test graceful shutdown. Development tool only.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/faketracewell"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:3999", "listen address")
	delay := flag.Duration("delay", 0, "artificial processing time per ingestion request")
	flag.Parse()

	sink := &faketracewell.Sink{Delay: *delay}
	srv := &http.Server{Addr: *addr, Handler: sink.Handler(), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("fake tracewell on %s (GET /stats for counts)", *addr)
	log.Fatal(srv.ListenAndServe())
}
