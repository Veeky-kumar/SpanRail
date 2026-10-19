package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
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
