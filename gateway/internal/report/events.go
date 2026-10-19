// Package report delivers observations to Tracewell's public ingestion API without ever
// slowing the proxied request: a bounded queue, background batching, retries and a
// drop-and-count policy when Tracewell cannot keep up.
package report

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/veeky-ai/tracewell-gateway/internal/ids"
	"github.com/veeky-ai/tracewell-gateway/internal/observe"
)

// Event is one entry of the ingestion batch: {id, timestamp, type, body}.
type Event struct {
	ID        string         `json:"id"`
	Timestamp string         `json:"timestamp"`
	Type      string         `json:"type"`
	Body      map[string]any `json:"body"`
}

// BuildEvents turns one observation into ingestion events.
//
//   - Without a client-supplied trace, a root trace is created first. In Tracewell a trace
//     is its own root observation (id == traceId, no parent).
//   - The generation is sent as a create plus an update, like the SDK does. All metadata,
//     usage and the end time live on the update only: the worker replaces `metadata`
//     wholesale, so splitting it across both events would let one erase the other.
//   - Anything unknown (usage, a network phase that did not happen, cost) is left out
//     rather than sent as zero. The gateway has no price table, so costDetails is never set.
func BuildEvents(o observe.Observation) []Event {
	var evs []Event
	traceID, parentID := o.TraceID, o.ParentObservationID
	if traceID == "" {
		traceID = ids.New()
		evs = append(evs, Event{
			ID: ids.New(), Timestamp: ts(o.Start), Type: "trace-create",
			Body: map[string]any{
				"id": traceID, "traceId": traceID, "parentObservationId": nil,
				"startTime": ts(o.Start), "name": "gateway " + o.Path,
			},
		})
	}
	if parentID == "" {
		parentID = traceID
	}

	create := map[string]any{
		"id": o.ID, "traceId": traceID, "parentObservationId": parentID,
		"startTime": ts(o.Start), "name": o.Name,
	}
	if o.Model != "" {
		create["model"] = o.Model
	}
	if o.Input != "" {
		create["input"] = jsonOrString(o.Input)
	}

	update := map[string]any{
		"id": o.ID, "traceId": traceID, "endTime": ts(o.End),
		"level":    level(o.Status),
		"metadata": map[string]any{"gateway": gatewayMeta(o)},
	}
	if msg := statusMessage(o.Status); msg != "" {
		update["statusMessage"] = msg
	}
	if len(o.Usage) > 0 {
		update["usageDetails"] = map[string]int64(o.Usage)
	}
	if o.Output != "" {
		update["output"] = jsonOrString(o.Output)
	}

	return append(evs,
		Event{ID: ids.New(), Timestamp: ts(o.Start), Type: "generation-create", Body: create},
		Event{ID: ids.New(), Timestamp: ts(o.End), Type: "generation-update", Body: update},
	)
}

func gatewayMeta(o observe.Observation) map[string]any {
	timing := map[string]float64{"total": ms(o.End.Sub(o.Start))}
	meta := map[string]any{
		"method": o.Method, "path": o.Path, "status": o.Status,
		"streaming": o.Streaming, "responseBytes": o.ResponseBytes,
		"timingMs": timing,
	}
	if t := o.Timings; t != nil {
		for name, d := range map[string]*time.Duration{"dns": t.DNS, "connect": t.Connect, "tls": t.TLS, "ttfb": t.TTFB} {
			if d != nil {
				timing[name] = ms(*d)
			}
		}
		meta["connReused"] = t.ConnReused
	}
	if o.Headers != nil {
		meta["requestHeaders"] = o.Headers
	}
	return meta
}

// ts formats a time the way Tracewell's zod datetime() accepts: UTC with a Z suffix.
func ts(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// ms converts to milliseconds with microsecond precision.
func ms(d time.Duration) float64 { return math.Round(float64(d)/1e3) / 1e3 }

func level(status int) string {
	switch {
	case status >= 500:
		return "ERROR"
	case status >= 400:
		return "WARNING"
	}
	return "DEFAULT"
}

func statusMessage(status int) string {
	if status < 400 {
		return ""
	}
	return fmt.Sprintf("HTTP %d %s", status, http.StatusText(status))
}

// jsonOrString embeds a captured body as JSON when it is complete valid JSON (so the UI can
// render it structured) and as plain text otherwise, e.g. when it was cut at the byte cap.
func jsonOrString(s string) any {
	if json.Valid([]byte(s)) {
		return json.RawMessage(s)
	}
	return s
}
