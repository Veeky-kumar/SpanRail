// Package config loads gateway settings from environment variables and fails fast,
// with a message naming the offending variable, when something is wrong.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config is the validated runtime configuration.
type Config struct {
	ListenAddr      string
	Upstream        *url.URL
	UpstreamTimeout time.Duration // max wait for upstream response headers
	ShutdownTimeout time.Duration // max time to finish in-flight work on SIGTERM

	PeekBytes       int64    // request-body prefix inspected for model/stream
	ParseMaxBytes   int64    // largest response held in memory to read token usage from
	CaptureBodies   bool     // report request/response bodies to Tracewell (off by default)
	CaptureMaxBytes int      // cap on each reported body
	CaptureHeaders  bool     // report request headers, redacted (off by default)
	RedactHeaders   []string // extra header names to redact, on top of the built-in list

	ReportEnabled     bool // false = plain proxy, nothing is sent to Tracewell
	TracewellURL      *url.URL
	PublicKey         string
	SecretKey         Secret
	BatchSize         int // events per ingestion request
	FlushInterval     time.Duration
	QueueSize         int // observations buffered before new ones are dropped
	ReportWorkers     int
	ReportMaxAttempts int
	ReportTimeout     time.Duration // per HTTP attempt to Tracewell
}

// Secret is a string that refuses to print itself, so a stray log line or %+v of the
// whole Config cannot leak the Tracewell secret key.
type Secret string

func (Secret) String() string             { return "[REDACTED]" }
func (Secret) GoString() string           { return "[REDACTED]" }
func (Secret) Format(f fmt.State, _ rune) { _, _ = f.Write([]byte("[REDACTED]")) }

// Load reads configuration through getenv (os.Getenv in production, a map in tests).
func Load(getenv func(string) string) (Config, error) {
	var c Config

	c.ListenAddr = getenv("LISTEN_ADDR")
	if c.ListenAddr == "" {
		c.ListenAddr = ":8080"
	}

	raw := getenv("UPSTREAM_URL")
	if raw == "" {
		return c, errors.New("UPSTREAM_URL is required (e.g. https://api.openai.com)")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return c, fmt.Errorf("UPSTREAM_URL is not a valid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return c, fmt.Errorf("UPSTREAM_URL scheme %q must be http or https", u.Scheme)
	}
	if u.Host == "" {
		return c, errors.New("UPSTREAM_URL must include a host")
	}
	if u.User != nil {
		return c, errors.New("UPSTREAM_URL must not contain credentials; keys come from client requests")
	}
	c.Upstream = u

	if c.UpstreamTimeout, err = duration(getenv, "UPSTREAM_TIMEOUT", 60*time.Second); err != nil {
		return c, err
	}
	if c.ShutdownTimeout, err = duration(getenv, "SHUTDOWN_TIMEOUT", 15*time.Second); err != nil {
		return c, err
	}

	if c.PeekBytes, err = size(getenv, "PEEK_BYTES", 64<<10); err != nil {
		return c, err
	}
	if c.ParseMaxBytes, err = size(getenv, "PARSE_MAX_BYTES", 1<<20); err != nil {
		return c, err
	}
	maxBody, err := size(getenv, "CAPTURE_MAX_BYTES", 16<<10)
	if err != nil {
		return c, err
	}
	c.CaptureMaxBytes = int(maxBody)
	if c.CaptureBodies, err = boolean(getenv, "CAPTURE_BODIES"); err != nil {
		return c, err
	}
	if c.CaptureHeaders, err = boolean(getenv, "CAPTURE_HEADERS"); err != nil {
		return c, err
	}
	for _, h := range strings.Split(getenv("REDACT_HEADERS"), ",") {
		if h = strings.TrimSpace(h); h != "" {
			c.RedactHeaders = append(c.RedactHeaders, h)
		}
	}
	return loadReporting(getenv, c)
}

func loadReporting(getenv func(string) string, c Config) (Config, error) {
	enabled := true
	if raw := getenv("REPORT_ENABLED"); raw != "" {
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return c, fmt.Errorf("REPORT_ENABLED: %q is not a boolean (use true or false)", raw)
		}
		enabled = b
	}
	c.ReportEnabled = enabled
	if !enabled {
		return c, nil
	}

	base := getenv("TRACEWELL_BASE_URL")
	if base == "" {
		base = "http://localhost:3000"
	}
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return c, fmt.Errorf("TRACEWELL_BASE_URL must be an http(s) URL with a host, got %q", base)
	}
	c.TracewellURL = u

	if c.PublicKey = getenv("TRACEWELL_PUBLIC_KEY"); c.PublicKey == "" {
		return c, errors.New("TRACEWELL_PUBLIC_KEY is required (or set REPORT_ENABLED=false to run as a plain proxy)")
	}
	secret := getenv("TRACEWELL_SECRET_KEY")
	if secret == "" {
		return c, errors.New("TRACEWELL_SECRET_KEY is required (or set REPORT_ENABLED=false to run as a plain proxy)")
	}
	c.SecretKey = Secret(secret)

	// An observation becomes up to 3 events and the API accepts 1000 per request, so 500
	// leaves comfortable headroom for a batch to overshoot by one observation.
	if c.BatchSize, err = count(getenv, "BATCH_SIZE", 50, 500); err != nil {
		return c, err
	}
	if c.QueueSize, err = count(getenv, "QUEUE_SIZE", 1000, 1_000_000); err != nil {
		return c, err
	}
	if c.ReportWorkers, err = count(getenv, "REPORT_WORKERS", 2, 64); err != nil {
		return c, err
	}
	if c.ReportMaxAttempts, err = count(getenv, "REPORT_MAX_ATTEMPTS", 5, 20); err != nil {
		return c, err
	}
	if c.FlushInterval, err = duration(getenv, "FLUSH_INTERVAL", 2*time.Second); err != nil {
		return c, err
	}
	if c.ReportTimeout, err = duration(getenv, "REPORT_TIMEOUT", 10*time.Second); err != nil {
		return c, err
	}
	return c, nil
}

// count reads a positive integer no larger than max.
func count(getenv func(string) string, key string, def, max int) (int, error) {
	raw := getenv(key)
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	if n < 1 || n > max {
		return 0, fmt.Errorf("%s must be between 1 and %d, got %d", key, max, n)
	}
	return n, nil
}

func size(getenv func(string) string, key string, def int64) (int64, error) {
	raw := getenv(key)
	if raw == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	if n <= 0 || n > 1<<30 {
		return 0, fmt.Errorf("%s must be between 1 and %d, got %s", key, 1<<30, raw)
	}
	return n, nil
}

// boolean reads a flag that is false unless set; only values strconv.ParseBool accepts are valid.
func boolean(getenv func(string) string, key string) (bool, error) {
	raw := getenv(key)
	if raw == "" {
		return false, nil
	}
	b, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s: %q is not a boolean (use true or false)", key, raw)
	}
	return b, nil
}

func duration(getenv func(string) string, key string, def time.Duration) (time.Duration, error) {
	raw := getenv(key)
	if raw == "" {
		return def, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("%s must be positive, got %s", key, raw)
	}
	return d, nil
}
