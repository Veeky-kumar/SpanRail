package config

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// env serves m as the environment. Tests that say nothing about Tracewell get reporting
// switched off, so they do not each need to supply keys.
func env(m map[string]string) func(string) string {
	_, hasKey := m["TRACEWELL_PUBLIC_KEY"]
	_, hasFlag := m["REPORT_ENABLED"]
	return func(k string) string {
		if k == "REPORT_ENABLED" && !hasKey && !hasFlag {
			return "false"
		}
		return m[k]
	}
}

func TestLoadCaptureSettings(t *testing.T) {
	base := map[string]string{"UPSTREAM_URL": "http://x"}
	with := func(kv ...string) map[string]string {
		m := map[string]string{}
		for k, v := range base {
			m[k] = v
		}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i]] = kv[i+1]
		}
		return m
	}

	c, err := Load(env(base))
	if err != nil {
		t.Fatal(err)
	}
	if c.CaptureBodies || c.CaptureHeaders || c.CaptureMaxBytes != 16384 || c.PeekBytes != 65536 ||
		c.ParseMaxBytes != 1<<20 || len(c.RedactHeaders) != 0 {
		t.Errorf("defaults wrong (bodies and headers must be off): %+v", c)
	}

	c, err = Load(env(with("CAPTURE_BODIES", "true", "CAPTURE_HEADERS", "1", "CAPTURE_MAX_BYTES", "100",
		"PEEK_BYTES", "200", "PARSE_MAX_BYTES", "300", "REDACT_HEADERS", " X-A , x-b,,")))
	if err != nil {
		t.Fatal(err)
	}
	if !c.CaptureBodies || !c.CaptureHeaders || c.CaptureMaxBytes != 100 || c.PeekBytes != 200 || c.ParseMaxBytes != 300 {
		t.Errorf("overrides not applied: %+v", c)
	}
	if len(c.RedactHeaders) != 2 || c.RedactHeaders[0] != "X-A" || c.RedactHeaders[1] != "x-b" {
		t.Errorf("RedactHeaders = %q", c.RedactHeaders)
	}

	for _, bad := range [][]string{
		{"CAPTURE_BODIES", "maybe"},
		{"CAPTURE_MAX_BYTES", "-5"},
		{"PEEK_BYTES", "lots"},
		{"PARSE_MAX_BYTES", "0"},
	} {
		if _, err := Load(env(with(bad...))); err == nil || !strings.Contains(err.Error(), bad[0]) {
			t.Errorf("%v: err = %v, want mention of %s", bad, err, bad[0])
		}
	}
}

func TestLoadReporting(t *testing.T) {
	keys := map[string]string{"UPSTREAM_URL": "http://x", "TRACEWELL_PUBLIC_KEY": "pk-1", "TRACEWELL_SECRET_KEY": "sk-very-secret"}
	with := func(kv ...string) map[string]string {
		m := map[string]string{}
		for k, v := range keys {
			m[k] = v
		}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i]] = kv[i+1]
		}
		return m
	}

	c, err := Load(env(keys))
	if err != nil {
		t.Fatal(err)
	}
	if !c.ReportEnabled || c.TracewellURL.String() != "http://localhost:3000" || c.PublicKey != "pk-1" ||
		c.BatchSize != 50 || c.FlushInterval != 2*time.Second || c.QueueSize != 1000 ||
		c.ReportWorkers != 2 || c.ReportMaxAttempts != 5 || c.ReportTimeout != 10*time.Second {
		t.Errorf("defaults wrong: %+v", c)
	}
	if string(c.SecretKey) != "sk-very-secret" {
		t.Error("secret not loaded")
	}
	for _, shown := range []string{fmt.Sprintf("%v", c), fmt.Sprintf("%+v", c), fmt.Sprintf("%#v", c), fmt.Sprint(c.SecretKey)} {
		if strings.Contains(shown, "sk-very-secret") {
			t.Errorf("secret key leaks when config is printed: %s", shown)
		}
	}

	c, err = Load(env(with("TRACEWELL_BASE_URL", "https://tw.example/", "BATCH_SIZE", "10", "FLUSH_INTERVAL", "500ms",
		"QUEUE_SIZE", "5", "REPORT_WORKERS", "4", "REPORT_MAX_ATTEMPTS", "3", "REPORT_TIMEOUT", "1s")))
	if err != nil {
		t.Fatal(err)
	}
	if c.TracewellURL.Host != "tw.example" || c.BatchSize != 10 || c.FlushInterval != 500*time.Millisecond ||
		c.QueueSize != 5 || c.ReportWorkers != 4 || c.ReportMaxAttempts != 3 || c.ReportTimeout != time.Second {
		t.Errorf("overrides not applied: %+v", c)
	}

	// Reporting can be switched off, and then keys are not needed.
	c, err = Load(env(map[string]string{"UPSTREAM_URL": "http://x", "REPORT_ENABLED": "false"}))
	if err != nil || c.ReportEnabled {
		t.Errorf("REPORT_ENABLED=false: enabled=%v err=%v", c.ReportEnabled, err)
	}

	for name, bad := range map[string]struct {
		kv   []string
		want string
	}{
		"missing public key": {[]string{"TRACEWELL_PUBLIC_KEY", ""}, "TRACEWELL_PUBLIC_KEY is required"},
		"missing secret key": {[]string{"TRACEWELL_SECRET_KEY", ""}, "TRACEWELL_SECRET_KEY is required"},
		"bad base url":       {[]string{"TRACEWELL_BASE_URL", "tracewell"}, "TRACEWELL_BASE_URL"},
		"batch too big":      {[]string{"BATCH_SIZE", "501"}, "BATCH_SIZE"},
		"batch zero":         {[]string{"BATCH_SIZE", "0"}, "BATCH_SIZE"},
		"queue zero":         {[]string{"QUEUE_SIZE", "0"}, "QUEUE_SIZE"},
		"workers bad":        {[]string{"REPORT_WORKERS", "x"}, "REPORT_WORKERS"},
		"attempts zero":      {[]string{"REPORT_MAX_ATTEMPTS", "0"}, "REPORT_MAX_ATTEMPTS"},
		"interval bad":       {[]string{"FLUSH_INTERVAL", "0s"}, "FLUSH_INTERVAL"},
		"report flag bad":    {[]string{"REPORT_ENABLED", "maybe"}, "REPORT_ENABLED"},
	} {
		if _, err := Load(env(with(bad.kv...))); err == nil || !strings.Contains(err.Error(), bad.want) {
			t.Errorf("%s: err = %v, want containing %q", name, err, bad.want)
		}
	}
}

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		wantErr string // substring; empty means success
		check   func(t *testing.T, c Config)
	}{
		{
			name: "defaults applied",
			env:  map[string]string{"UPSTREAM_URL": "https://api.example.com/"},
			check: func(t *testing.T, c Config) {
				if c.ListenAddr != ":8080" {
					t.Errorf("ListenAddr = %q", c.ListenAddr)
				}
				if c.Upstream.String() != "https://api.example.com/" {
					t.Errorf("Upstream = %q", c.Upstream)
				}
				if c.UpstreamTimeout != 60*time.Second {
					t.Errorf("UpstreamTimeout = %v", c.UpstreamTimeout)
				}
				if c.ShutdownTimeout != 15*time.Second {
					t.Errorf("ShutdownTimeout = %v", c.ShutdownTimeout)
				}
			},
		},
		{
			name: "overrides",
			env: map[string]string{
				"UPSTREAM_URL":     "http://localhost:9000",
				"LISTEN_ADDR":      "127.0.0.1:9999",
				"UPSTREAM_TIMEOUT": "5s",
				"SHUTDOWN_TIMEOUT": "2s",
			},
			check: func(t *testing.T, c Config) {
				if c.ListenAddr != "127.0.0.1:9999" || c.UpstreamTimeout != 5*time.Second || c.ShutdownTimeout != 2*time.Second {
					t.Errorf("unexpected config: %+v", c)
				}
			},
		},
		{name: "missing upstream", env: map[string]string{}, wantErr: "UPSTREAM_URL is required"},
		{name: "bad scheme", env: map[string]string{"UPSTREAM_URL": "ftp://x"}, wantErr: "must be http or https"},
		{name: "no host", env: map[string]string{"UPSTREAM_URL": "http://"}, wantErr: "must include a host"},
		{name: "unparseable", env: map[string]string{"UPSTREAM_URL": "http://[::1"}, wantErr: "UPSTREAM_URL"},
		{
			name:    "bad duration",
			env:     map[string]string{"UPSTREAM_URL": "http://x", "UPSTREAM_TIMEOUT": "soon"},
			wantErr: "UPSTREAM_TIMEOUT",
		},
		{
			name:    "non-positive duration",
			env:     map[string]string{"UPSTREAM_URL": "http://x", "UPSTREAM_TIMEOUT": "0s"},
			wantErr: "must be positive",
		},
		{
			name:    "credentials in upstream url rejected",
			env:     map[string]string{"UPSTREAM_URL": "https://user:pw@x.example"},
			wantErr: "must not contain credentials",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := Load(env(tt.env))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			tt.check(t, c)
		})
	}
}
