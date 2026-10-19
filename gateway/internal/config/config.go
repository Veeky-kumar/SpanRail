// Package config loads gateway settings from environment variables and fails fast,
// with a message naming the offending variable, when something is wrong.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"time"
)

// Config is the validated runtime configuration.
type Config struct {
	ListenAddr      string
	Upstream        *url.URL
	UpstreamTimeout time.Duration // max wait for upstream response headers
	ShutdownTimeout time.Duration // max time to finish in-flight work on SIGTERM
}

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
	return c, nil
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
