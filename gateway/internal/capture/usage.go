// Package capture extracts what the gateway reports from requests and responses without
// changing the bytes that flow through: model name, streaming flag, and token usage.
package capture

import (
	"encoding/json"
	"math"
)

// Usage holds token counts keyed "input", "output" and "total", matching the usageDetails
// shape Tracewell ingests. A key is present only if the provider reported it (or, for
// total, if both input and output were reported). A nil Usage means unknown.
type Usage map[string]int64

// ParseBody returns the token usage (nil if unknown) and the model name of a JSON response in
// one pass over the body, instead of decoding a possibly megabyte-sized document twice.
func ParseBody(body []byte) (Usage, string) {
	var v struct {
		Model string         `json:"model"`
		Usage map[string]any `json:"usage"`
	}
	if json.Unmarshal(body, &v) != nil {
		return nil, ""
	}
	return usageFrom(v.Usage), truncateModel(v.Model)
}

// ParseModelJSON returns the top-level "model" of a JSON response body, or "" if absent.
// Providers echo the resolved model name there (e.g. a dated snapshot).
func ParseModelJSON(body []byte) string {
	var v struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(body, &v) != nil {
		return ""
	}
	return truncateModel(v.Model)
}

// ParseUsageJSON reads the "usage" object of an OpenAI-compatible (prompt_tokens /
// completion_tokens / total_tokens) or Responses/Anthropic-style (input_tokens /
// output_tokens) JSON body. It never guesses: anything missing or malformed stays absent.
func ParseUsageJSON(body []byte) Usage {
	var v struct {
		Usage map[string]any `json:"usage"`
	}
	if json.Unmarshal(body, &v) != nil {
		return nil
	}
	return usageFrom(v.Usage)
}

// usageFrom reads token counts from a decoded "usage" object.
func usageFrom(raw map[string]any) Usage {
	if raw == nil {
		return nil
	}
	num := func(keys ...string) (int64, bool) {
		for _, k := range keys {
			if f, ok := raw[k].(float64); ok && f >= 0 && f == math.Trunc(f) && f < 1<<53 {
				return int64(f), true
			}
		}
		return 0, false
	}
	u := Usage{}
	in, hasIn := num("prompt_tokens", "input_tokens")
	out, hasOut := num("completion_tokens", "output_tokens")
	total, hasTotal := num("total_tokens")
	if hasIn {
		u["input"] = in
	}
	if hasOut {
		u["output"] = out
	}
	switch {
	case hasTotal:
		u["total"] = total
	case hasIn && hasOut:
		u["total"] = in + out
	}
	if len(u) == 0 {
		return nil
	}
	return u
}
