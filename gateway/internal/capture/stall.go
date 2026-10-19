package capture

import (
	"context"
	"sync/atomic"
)

type stallKey struct{}

// StallFlag records that the client stopped sending its request body.
//
// A typed error is not enough to report this: when a connection read hits its deadline,
// net/http cancels the request context, so the proxy's error handler sees context.Canceled
// and would treat a stalled client like one that left (answering with an empty 200). The flag
// travels on the request context instead, which survives the cancellation.
type StallFlag struct{ stalled atomic.Bool }

// Set marks the stall.
func (f *StallFlag) Set() { f.stalled.Store(true) }

// WithStallFlag returns a context carrying a new flag.
func WithStallFlag(ctx context.Context) (context.Context, *StallFlag) {
	f := &StallFlag{}
	return context.WithValue(ctx, stallKey{}, f), f
}

// Stalled reports whether the context's client stalled while sending its body.
func Stalled(ctx context.Context) bool {
	f, _ := ctx.Value(stallKey{}).(*StallFlag)
	return f != nil && f.stalled.Load()
}
