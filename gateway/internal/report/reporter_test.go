package report

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
)

// fakeSender records every Send and answers from a script.
type fakeSender struct {
	mu      sync.Mutex
	batches [][]Event
	script  func(call int, evs []Event) Result // nil = accept everything
	calls   int
	block   chan struct{} // if set, Send waits for it or for ctx cancellation
	gotCh   chan []Event
}

func newFake() *fakeSender { return &fakeSender{gotCh: make(chan []Event, 64)} }

func (f *fakeSender) Send(ctx context.Context, evs []Event) Result {
	f.mu.Lock()
	f.calls++
	call := f.calls
	f.batches = append(f.batches, evs)
	f.mu.Unlock()
	select {
	case f.gotCh <- evs:
	default:
	}
	if f.block != nil {
		select {
		case <-f.block:
		case <-ctx.Done():
			return Result{Retry: evs, Err: ctx.Err()}
		}
	}
	if f.script != nil {
		return f.script(call, evs)
	}
	return Result{Accepted: len(evs)}
}

func (f *fakeSender) total() (n int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, b := range f.batches {
		n += len(b)
	}
	return
}
func (f *fakeSender) callCount() int { f.mu.Lock(); defer f.mu.Unlock(); return f.calls }

func (f *fakeSender) waitBatch(t *testing.T) []Event {
	t.Helper()
	select {
	case b := <-f.gotCh:
		return b
	case <-time.After(3 * time.Second):
		t.Fatal("no batch delivered")
		return nil
	}
}

func cfg() Config {
	return Config{QueueSize: 100, BatchSize: 100, Workers: 1, FlushInterval: time.Hour, MaxAttempts: 4,
		BaseBackoff: time.Millisecond, MaxBackoff: 8 * time.Millisecond}
}

func obs(i int) observe.Observation {
	o := baseObs()
	o.ID = "gen-" + string(rune('a'+i%26))
	return o
}

func closeNow(t *testing.T, r *Reporter) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.Close(ctx); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestFlushesWhenBatchIsFull(t *testing.T) {
	f := newFake()
	c := cfg()
	c.BatchSize = 6 // two observations = 6 events (trace + create + update each)
	r := New(c, f, metrics.New())
	defer closeNow(t, r)

	r.Enqueue(obs(0))
	select {
	case <-f.gotCh:
		t.Fatal("flushed before the batch was full")
	case <-time.After(100 * time.Millisecond):
	}
	r.Enqueue(obs(1))
	if got := f.waitBatch(t); len(got) != 6 {
		t.Errorf("batch = %d events, want 6", len(got))
	}
}

func TestFlushesOnInterval(t *testing.T) {
	f := newFake()
	c := cfg()
	c.FlushInterval = 80 * time.Millisecond
	r := New(c, f, metrics.New())
	defer closeNow(t, r)

	start := time.Now()
	r.Enqueue(obs(0))
	got := f.waitBatch(t)
	if len(got) != 3 {
		t.Errorf("batch = %d events, want 3", len(got))
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("took %v for an 80ms interval", elapsed)
	}
}

func TestQueueFullDropsAndCountsWithoutBlocking(t *testing.T) {
	f := newFake()
	f.block = make(chan struct{}) // the worker gets stuck in Send, so the queue cannot drain
	c := cfg()
	c.QueueSize, c.BatchSize = 2, 3
	m := metrics.New()
	r := New(c, f, m)
	defer func() { close(f.block); closeNow(t, r) }()

	accepted, dropped := 0, 0
	start := time.Now()
	for i := 0; i < 50; i++ {
		if r.Enqueue(obs(i)) {
			accepted++
		} else {
			dropped++
		}
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("Enqueue blocked the caller: 50 calls took %v", elapsed)
	}
	if dropped == 0 || accepted+dropped != 50 {
		t.Fatalf("accepted=%d dropped=%d", accepted, dropped)
	}
	if got := testCounter(t, m, "tracewell_gateway_report_dropped_total"); got != float64(dropped) {
		t.Errorf("dropped metric = %v, want %d", got, dropped)
	}
	if d := r.QueueDepth(); d > 2 {
		t.Errorf("queue depth %v exceeds capacity 2", d)
	}
}

func TestRetriesWithBackoffThenSucceeds(t *testing.T) {
	f := newFake()
	f.script = func(call int, evs []Event) Result {
		if call < 3 {
			return Result{Retry: evs, Err: errors.New("503")}
		}
		return Result{Accepted: len(evs)}
	}
	var sleeps []time.Duration
	var mu sync.Mutex
	c := cfg()
	c.BatchSize = 3
	c.BaseBackoff, c.MaxBackoff = 100*time.Millisecond, time.Second
	c.Rand = func() float64 { return 1 } // max jitter, so the sleeps equal the backoff ceiling
	c.Sleep = func(_ context.Context, d time.Duration) error {
		mu.Lock()
		sleeps = append(sleeps, d)
		mu.Unlock()
		return nil
	}
	m := metrics.New()
	r := New(c, f, m)

	r.Enqueue(obs(0))
	closeNow(t, r)

	if f.callCount() != 3 {
		t.Fatalf("Send called %d times, want 3", f.callCount())
	}
	mu.Lock()
	defer mu.Unlock()
	if len(sleeps) != 2 || sleeps[0] != 100*time.Millisecond || sleeps[1] != 200*time.Millisecond {
		t.Errorf("sleeps = %v, want [100ms 200ms] (exponential)", sleeps)
	}
	if got := testCounter(t, m, "tracewell_gateway_report_events_sent_total"); got != 3 {
		t.Errorf("events sent = %v", got)
	}
	if got := testCounter(t, m, "tracewell_gateway_report_flush_failures_total"); got != 0 {
		t.Errorf("flush failures = %v", got)
	}
}

func TestGivesUpAfterMaxAttemptsAndCountsFailure(t *testing.T) {
	f := newFake()
	f.script = func(_ int, evs []Event) Result { return Result{Retry: evs, Err: errors.New("down")} }
	c := cfg()
	c.MaxAttempts = 3
	c.Sleep = func(context.Context, time.Duration) error { return nil }
	m := metrics.New()
	r := New(c, f, m)
	r.Enqueue(obs(0))
	closeNow(t, r)

	if f.callCount() != 3 {
		t.Errorf("attempts = %d, want 3", f.callCount())
	}
	if got := testCounter(t, m, "tracewell_gateway_report_flush_failures_total"); got != 1 {
		t.Errorf("flush failures = %v, want 1", got)
	}
}

func TestOnlyFailedEventsAreRetried(t *testing.T) {
	f := newFake()
	f.script = func(call int, evs []Event) Result {
		if call == 1 {
			return Result{Accepted: len(evs) - 1, Retry: evs[:1], Err: errors.New("one failed")}
		}
		return Result{Accepted: len(evs)}
	}
	c := cfg()
	c.Sleep = func(context.Context, time.Duration) error { return nil }
	r := New(c, f, metrics.New())
	r.Enqueue(obs(0))
	closeNow(t, r)

	if f.callCount() != 2 || len(f.batches[1]) != 1 {
		t.Errorf("calls=%d second batch=%d events, want 2 calls and a 1-event retry", f.callCount(), len(f.batches[1]))
	}
}

func TestPermanentRejectionIsNotRetried(t *testing.T) {
	f := newFake()
	f.script = func(_ int, evs []Event) Result { return Result{Rejected: len(evs), Err: errors.New("401")} }
	m := metrics.New()
	r := New(cfg(), f, m)
	r.Enqueue(obs(0))
	closeNow(t, r)
	if f.callCount() != 1 {
		t.Errorf("attempts = %d, want 1", f.callCount())
	}
	if got := testCounter(t, m, "tracewell_gateway_report_flush_failures_total"); got != 1 {
		t.Errorf("flush failures = %v, want 1", got)
	}
}

func TestCloseFlushesQueuedEventsAndLaterEnqueuesAreDropped(t *testing.T) {
	f := newFake()
	m := metrics.New()
	r := New(cfg(), f, m) // batch size and interval too big to flush on their own
	for i := 0; i < 5; i++ {
		r.Enqueue(obs(i))
	}
	closeNow(t, r)
	if f.total() != 15 {
		t.Errorf("delivered %d events at shutdown, want 15", f.total())
	}
	if r.Enqueue(obs(9)) {
		t.Error("Enqueue after Close must be refused")
	}
	if got := testCounter(t, m, "tracewell_gateway_report_dropped_total"); got != 1 {
		t.Errorf("dropped = %v", got)
	}
	closeNow(t, r) // idempotent
}

func TestCloseGivesUpWhenDeadlinePasses(t *testing.T) {
	f := newFake()
	f.block = make(chan struct{}) // never released: Tracewell "hangs"
	c := cfg()
	c.BatchSize = 3
	r := New(c, f, metrics.New())
	r.Enqueue(obs(0))
	f.waitBatch(t) // worker is now stuck inside Send

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	err := r.Close(ctx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("Close err = %v, want deadline exceeded", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Errorf("Close hung for %v", time.Since(start))
	}
}

func TestConcurrentEnqueueAndCloseIsRaceFree(t *testing.T) {
	f := newFake()
	r := New(cfg(), f, metrics.New())
	var wg sync.WaitGroup
	var accepted atomic.Int64
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				if r.Enqueue(obs(i)) {
					accepted.Add(1)
				}
			}
		}()
	}
	time.Sleep(2 * time.Millisecond)
	closeNow(t, r)
	wg.Wait()
	if f.total() != int(accepted.Load())*3 {
		t.Errorf("delivered %d events for %d accepted observations (x3)", f.total(), accepted.Load())
	}
}

func TestBackoff(t *testing.T) {
	base, max := 100*time.Millisecond, 1*time.Second
	tests := []struct {
		attempt int
		rnd     float64
		want    time.Duration
	}{
		{1, 1, 100 * time.Millisecond},
		{2, 1, 200 * time.Millisecond},
		{3, 1, 400 * time.Millisecond},
		{5, 1, time.Second}, // capped
		{40, 1, time.Second},
		{3, 0, 0}, // full jitter reaches zero
		{3, 0.5, 200 * time.Millisecond},
	}
	for _, tt := range tests {
		if got := backoff(tt.attempt, base, max, tt.rnd); got != tt.want {
			t.Errorf("backoff(%d, rnd=%v) = %v, want %v", tt.attempt, tt.rnd, got, tt.want)
		}
	}
}

func testCounter(t *testing.T, m *metrics.Metrics, name string) float64 {
	t.Helper()
	v, err := m.Value(name)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
