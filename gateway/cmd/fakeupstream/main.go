// Command fakeupstream runs a fake OpenAI-compatible server for demos, the end-to-end check
// and benchmarks. It is a development tool and is not part of the gateway image.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/veeky-ai/spanrail-gateway/internal/fakeupstream"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:9000", "listen address")
	latency := flag.Duration("latency", 0, "delay before the first byte")
	chunkDelay := flag.Duration("chunk-delay", 0, "delay between streamed chunks")
	chunks := flag.Int("chunks", 5, "content chunks in a streamed reply")
	flag.Parse()

	srv := &http.Server{
		Addr:              *addr,
		Handler:           fakeupstream.Handler(fakeupstream.Options{Latency: *latency, ChunkDelay: *chunkDelay, Chunks: *chunks}),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("fake upstream on %s (latency %s)", *addr, *latency)
	log.Fatal(srv.ListenAndServe())
}
