package redact

import (
	"net/http"
	"strings"
	"testing"
)

func TestHeaders(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer sk-secret")
	h.Set("Proxy-Authorization", "Basic abc")
	h.Set("Cookie", "s=1")
	h.Set("X-Api-Key", "k")
	h.Set("X-Custom-Secret", "hunter2")
	h.Set("User-Agent", "openai-python/1.0")
	h.Add("Accept", "a")
	h.Add("Accept", "b")

	got := Headers(h, []string{"x-custom-secret"})

	for _, k := range []string{"Authorization", "Proxy-Authorization", "Cookie", "X-Api-Key", "X-Custom-Secret"} {
		if got[k] != Placeholder {
			t.Errorf("%s = %q, want %q", k, got[k], Placeholder)
		}
	}
	if got["User-Agent"] != "openai-python/1.0" || got["Accept"] != "a, b" {
		t.Errorf("non-sensitive headers mangled: %v", got)
	}
	for k, v := range got {
		if strings.Contains(v, "sk-secret") || strings.Contains(v, "hunter2") {
			t.Errorf("secret leaked in %s=%q", k, v)
		}
	}
}

func TestHeadersTruncatesLongValues(t *testing.T) {
	h := http.Header{}
	h.Set("X-Long", strings.Repeat("a", 5000))
	if got := Headers(h, nil)["X-Long"]; len(got) > maxValue+len("…") {
		t.Errorf("len = %d", len(got))
	}
}
