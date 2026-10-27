// Package redact turns HTTP headers into a map that is safe to send to Spanrail.
package redact

import (
	"net/http"
	"regexp"
	"strings"
)

// Placeholder replaces the value of every sensitive header.
const Placeholder = "[REDACTED]"

const maxValue = 256

// alwaysRedacted headers carry credentials for common LLM providers and proxies. They are
// redacted regardless of configuration so a misconfigured list cannot leak a provider key.
var alwaysRedacted = map[string]bool{
	"authorization":       true,
	"proxy-authorization": true,
	"cookie":              true,
	"set-cookie":          true,
	"x-api-key":           true,
	"api-key":             true,
	"x-goog-api-key":      true,
	"openai-organization": true,
}

// looksSecret catches credential-bearing headers that no list can enumerate (X-Auth-Token,
// X-Amz-Security-Token, X-Session-Id, ...). It deliberately over-redacts: a false positive
// hides a harmless value, a false negative would leak a key.
var looksSecret = regexp.MustCompile(`key|token|secret|auth|cookie|session|passw|credential`)

// Headers flattens h to name -> value, redacting the built-in sensitive names plus extra
// (case-insensitive). Multiple values are joined with ", " and long values are truncated.
func Headers(h http.Header, extra []string) map[string]string {
	deny := make(map[string]bool, len(extra))
	for _, e := range extra {
		deny[strings.ToLower(strings.TrimSpace(e))] = true
	}
	out := make(map[string]string, len(h))
	for name, vals := range h {
		key := http.CanonicalHeaderKey(name)
		lower := strings.ToLower(name)
		if alwaysRedacted[lower] || deny[lower] || looksSecret.MatchString(lower) {
			out[key] = Placeholder
			continue
		}
		v := strings.Join(vals, ", ")
		if len(v) > maxValue {
			v = strings.ToValidUTF8(v[:maxValue], "") + "…"
		}
		out[key] = v
	}
	return out
}
