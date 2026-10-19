package report

import (
	"context"
	"log"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/metrics"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
)

// Result is the outcome of one Send.
type Result struct {
	Accepted int     // events Tracewell stored
	Rejected int     // events it refused for good (validation, auth): retrying cannot help
	Retry    []Event // events worth sending again (network error, 429, 5xx)
	Err      error   // describes any failure; nil when everything was accepted
}

// Sender delivers a batch of events once. Retrying is the Reporter's job.
type Sender interface {
	Send(ctx context.Context, events []Event) Result
}

// Config tunes the Reporter.
type Config struct {
	QueueSize     int           // observations waiting; beyond this they are dropped
	BatchSize     int           // events per request (an observation is up to 3 events)
	Workers       int           // goroutines batching and sending
	FlushInterval time.Duration // send a partial batch at least this often
	MaxAttempts   int           // total tries per batch, including the first
	BaseBackoff   time.Duration // first retry waits up to this long
	MaxBackoff    time.Duration // ceiling for the exponential growth

	// Optional hooks so tests can control time and randomness.
	Sleep func(ctx context.Context, d time.Duration) error
	Rand  func() float64 // in [0,1)
}

// Reporter accepts observations from the request path and sends them to Tracewell in the
// background. Enqueue never blocks: when the queue is full the observation is dropped and
// counted, because delaying a customer's LLM call to log it would be the wrong trade.
type Reporter struct {
	cfg    Config
	sender Sender
	m      *metrics.Metrics

	queue chan observe.Observation

	mu     sync.RWMutex // guards closed and the close of queue
	closed bool

	ctx    context.Context // cancelled when Close gives up waiting
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New starts the workers.
func New(cfg Config, sender Sender, m *metrics.Metrics) *Reporter {
	if cfg.Sleep == nil {
		cfg.Sleep = sleep
	}
	if cfg.Rand == nil {
		cfg.Rand = rand.Float64
	}
	ctx, cancel := context.WithCancel(context.Background())
	r := &Reporter{cfg: cfg, sender: sender, m: m, queue: make(chan observe.Observation, cfg.QueueSize), ctx: ctx, cancel: cancel}
	for i := 0; i < cfg.Workers; i++ {
		r.wg.Add(1)
		go r.worker()
	}
	return r
}

// Enqueue hands an observation to the background workers. It reports whether it was
// accepted; false means it was dropped (queue full or reporter closed) and counted.
func (r *Reporter) Enqueue(o observe.Observation) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if !r.closed {
		select {
		case r.queue <- o:
			return true
		default:
		}
	}
	r.m.Dropped.Inc()
	return false
}

// QueueDepth is the number of observations waiting, for the metrics gauge.
func (r *Reporter) QueueDepth() float64 { return float64(len(r.queue)) }

// Close stops accepting observations, sends everything already queued, and returns when
// that is done or ctx expires, whichever is first. Safe to call more than once.
func (r *Reporter) Close(ctx context.Context) error {
	r.mu.Lock()
	if !r.closed {
		r.closed = true
		close(r.queue) // workers drain what is left, then exit
	}
	r.mu.Unlock()

	done := make(chan struct{})
	go func() { r.wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		r.cancel() // abort in-flight sends and backoff sleeps so workers wind down
		return ctx.Err()
	}
}

func (r *Reporter) worker() {
	defer r.wg.Done()
	ticker := time.NewTicker(r.cfg.FlushInterval)
	defer ticker.Stop()

	var batch []Event
	flush := func() {
		if len(batch) > 0 {
			r.deliver(batch)
			batch = nil
		}
	}
	for {
		select {
		case o, ok := <-r.queue:
			if !ok { // closed and drained
				flush()
				return
			}
			batch = append(batch, BuildEvents(o)...)
			if len(batch) >= r.cfg.BatchSize {
				flush()
				ticker.Reset(r.cfg.FlushInterval)
			}
		case <-ticker.C:
			flush()
		}
	}
}

// deliver sends a batch, retrying only the events that failed in a retryable way, with
// exponential backoff and full jitter between attempts.
func (r *Reporter) deliver(events []Event) {
	pending := events
	rejected := 0
	var lastErr error
	for attempt := 1; attempt <= r.cfg.MaxAttempts; attempt++ {
		if attempt > 1 {
			wait := backoff(attempt-1, r.cfg.BaseBackoff, r.cfg.MaxBackoff, r.cfg.Rand())
			if err := r.cfg.Sleep(r.ctx, wait); err != nil {
				lastErr = err
				break
			}
		}
		res := r.sender.Send(r.ctx, pending)
		r.m.EventsSent.Add(float64(res.Accepted))
		rejected += res.Rejected
		if res.Err != nil {
			lastErr = res.Err
		}
		pending = res.Retry
		if len(pending) == 0 {
			break
		}
	}
	if lost := rejected + len(pending); lost > 0 {
		r.m.FlushFailures.Inc()
		log.Printf("report: lost %d of %d events: %v", lost, len(events), lastErr)
	}
}

// backoff returns how long to wait before retry number `attempt` (1 = first retry).
// The ceiling doubles each time up to max; rnd in [0,1) picks a point below it. Using the
// whole range ("full jitter") stops many gateways from retrying in lockstep after an outage.
func backoff(attempt int, base, max time.Duration, rnd float64) time.Duration {
	ceiling := base
	for i := 1; i < attempt && ceiling < max; i++ {
		ceiling *= 2
	}
	if ceiling > max {
		ceiling = max
	}
	return time.Duration(float64(ceiling) * rnd)
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
