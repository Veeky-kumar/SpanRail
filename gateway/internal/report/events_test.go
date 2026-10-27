package report

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/veeky-ai/spanrail-gateway/internal/capture"
	"github.com/veeky-ai/spanrail-gateway/internal/nettrace"
	"github.com/veeky-ai/spanrail-gateway/internal/observe"
)

func dur(ms float64) *time.Duration {
	d := time.Duration(ms * float64(time.Millisecond))
	return &d
}

var t0 = time.Date(2026, 10, 20, 10, 0, 0, 123_000_000, time.UTC)

func baseObs() observe.Observation {
	return observe.Observation{
		ID: "gen-1", Name: "chat.completions", Model: "gpt-4o-mini", Method: "POST", Path: "/v1/chat/completions",
		Start: t0, End: t0.Add(180500 * time.Microsecond), Status: 200, ResponseBytes: 412,
		Usage: capture.Usage{"input": 12, "output": 5, "total": 17},
		Timings: &nettrace.Snapshot{
			DNS: dur(3.1), Connect: dur(8.4), TLS: dur(21.7), TTFB: dur(140.2), ConnReused: new(bool),
		},
	}
}

func byType(evs []Event) map[string]Event {
	m := map[string]Event{}
	for _, e := range evs {
		m[e.Type] = e
	}
	return m
}

func TestBuildEventsNewTrace(t *testing.T) {
	evs := BuildEvents(baseObs())
	if len(evs) != 3 {
		t.Fatalf("got %d events, want trace-create + generation-create + generation-update", len(evs))
	}
	m := byType(evs)
	tr, gc, gu := m["trace-create"].Body, m["generation-create"].Body, m["generation-update"].Body

	traceID := tr["id"].(string)
	if traceID == "" || tr["traceId"] != traceID || tr["parentObservationId"] != nil {
		t.Errorf("trace root must have id == traceId and a null parent: %v", tr)
	}
	if gc["id"] != "gen-1" || gc["traceId"] != traceID || gc["parentObservationId"] != traceID {
		t.Errorf("generation not linked under the new trace: %v", gc)
	}
	if gc["model"] != "gpt-4o-mini" || gc["name"] != "chat.completions" {
		t.Errorf("generation-create fields: %v", gc)
	}
	if gu["id"] != "gen-1" || gu["traceId"] != traceID {
		t.Errorf("update must target the same generation: %v", gu)
	}
	if gu["level"] != "DEFAULT" {
		t.Errorf("level = %v", gu["level"])
	}
	if _, has := gc["metadata"]; has {
		t.Error("metadata must live only on the update: the worker replaces metadata wholesale")
	}

	usage := gu["usageDetails"].(map[string]int64)
	if usage["input"] != 12 || usage["output"] != 5 || usage["total"] != 17 {
		t.Errorf("usageDetails = %v", usage)
	}
	if _, has := gu["costDetails"]; has {
		t.Error("costDetails must be omitted: the gateway has no price table and does not invent cost")
	}

	gw := gu["metadata"].(map[string]any)["gateway"].(map[string]any)
	tm := gw["timingMs"].(map[string]float64)
	if tm["dns"] != 3.1 || tm["connect"] != 8.4 || tm["tls"] != 21.7 || tm["ttfb"] != 140.2 || tm["total"] != 180.5 {
		t.Errorf("timingMs = %v", tm)
	}
	if gw["status"] != 200 || gw["streaming"] != false || gw["responseBytes"] != int64(412) || gw["connReused"] != false {
		t.Errorf("gateway metadata = %v", gw)
	}
}

func TestBuildEventsExistingTraceSkipsTraceCreate(t *testing.T) {
	o := baseObs()
	o.TraceID, o.ParentObservationID = "trace-abc", "span-9"
	evs := BuildEvents(o)
	if len(evs) != 2 {
		t.Fatalf("got %d events, want 2 (no trace-create)", len(evs))
	}
	gc := byType(evs)["generation-create"].Body
	if gc["traceId"] != "trace-abc" || gc["parentObservationId"] != "span-9" {
		t.Errorf("generation not attached to the supplied trace/parent: %v", gc)
	}

	o.ParentObservationID = ""
	gc = byType(BuildEvents(o))["generation-create"].Body
	if gc["parentObservationId"] != "trace-abc" {
		t.Errorf("without a parent the generation hangs off the trace root, got %v", gc["parentObservationId"])
	}
}

func TestBuildEventsUnknownsAreOmittedNotZero(t *testing.T) {
	o := baseObs()
	o.Usage = nil
	reused := true
	o.Timings = &nettrace.Snapshot{ConnReused: &reused, TTFB: dur(40)}
	o.Model = ""
	gu := byType(BuildEvents(o))["generation-update"].Body
	if _, has := gu["usageDetails"]; has {
		t.Error("usageDetails present although usage is unknown")
	}
	tm := gu["metadata"].(map[string]any)["gateway"].(map[string]any)["timingMs"].(map[string]float64)
	for _, k := range []string{"dns", "connect", "tls"} {
		if _, has := tm[k]; has {
			t.Errorf("%s reported on a reused connection", k)
		}
	}
	if tm["ttfb"] != 40 {
		t.Errorf("ttfb = %v", tm["ttfb"])
	}
	if _, has := byType(BuildEvents(o))["generation-create"].Body["model"]; has {
		t.Error("empty model must be omitted")
	}
}

func TestBuildEventsLevels(t *testing.T) {
	tests := []struct {
		status    int
		wantLevel string
		wantMsg   bool
	}{
		{200, "DEFAULT", false},
		{404, "WARNING", true},
		{429, "WARNING", true},
		{500, "ERROR", true},
		{502, "ERROR", true},
		{504, "ERROR", true},
		{499, "WARNING", true},
	}
	for _, tt := range tests {
		o := baseObs()
		o.Status = tt.status
		gu := byType(BuildEvents(o))["generation-update"].Body
		if gu["level"] != tt.wantLevel {
			t.Errorf("status %d: level = %v, want %s", tt.status, gu["level"], tt.wantLevel)
		}
		if _, has := gu["statusMessage"]; has != tt.wantMsg {
			t.Errorf("status %d: statusMessage present = %v", tt.status, has)
		}
	}
}

func TestBuildEventsBodiesAndHeaders(t *testing.T) {
	o := baseObs()
	o.Input, o.Output = `{"model":"m"}`, `partial output that is not json {`
	o.Headers = map[string]string{"User-Agent": "x", "Authorization": "[REDACTED]"}
	m := byType(BuildEvents(o))
	if in, ok := m["generation-create"].Body["input"].(json.RawMessage); !ok || string(in) != `{"model":"m"}` {
		t.Errorf("valid JSON input should be embedded as JSON, got %#v", m["generation-create"].Body["input"])
	}
	if out := m["generation-update"].Body["output"]; out != o.Output {
		t.Errorf("non-JSON output should stay a string, got %#v", out)
	}
	gw := m["generation-update"].Body["metadata"].(map[string]any)["gateway"].(map[string]any)
	if gw["requestHeaders"].(map[string]string)["Authorization"] != "[REDACTED]" {
		t.Errorf("headers = %v", gw["requestHeaders"])
	}

	o.Input, o.Output, o.Headers = "", "", nil
	m = byType(BuildEvents(o))
	if _, has := m["generation-create"].Body["input"]; has {
		t.Error("input present when bodies are not captured")
	}
	if _, has := m["generation-update"].Body["output"]; has {
		t.Error("output present when bodies are not captured")
	}
}

func TestBuildEventsSerializeToWhatTheIngestionSchemaAccepts(t *testing.T) {
	iso := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`)
	evs := BuildEvents(baseObs())
	raw, err := json.Marshal(map[string]any{"batch": evs})
	if err != nil {
		t.Fatal(err)
	}
	var back struct {
		Batch []struct {
			ID, Timestamp, Type string
			Body                map[string]any
		}
	}
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, e := range back.Batch {
		if e.ID == "" || ids[e.ID] {
			t.Errorf("event ids must be unique and non-empty: %q", e.ID)
		}
		ids[e.ID] = true
		if !iso.MatchString(e.Timestamp) {
			t.Errorf("timestamp %q is not zod-datetime compatible (UTC, ms, Z)", e.Timestamp)
		}
		for _, k := range []string{"startTime", "endTime"} {
			if s, ok := e.Body[k].(string); ok && !iso.MatchString(s) {
				t.Errorf("%s %q not ISO UTC", k, s)
			}
		}
	}
	if len(back.Batch) != 3 {
		t.Errorf("round-tripped %d events", len(back.Batch))
	}
}

func TestClientClosedStatusMessageHasNoTrailingSpace(t *testing.T) {
	o := baseObs()
	o.Status = 499
	msg := byType(BuildEvents(o))["generation-update"].Body["statusMessage"].(string)
	if msg != strings.TrimSpace(msg) || !strings.Contains(msg, "499") || !strings.Contains(strings.ToLower(msg), "client") {
		t.Errorf("statusMessage = %q", msg)
	}
}

func TestConnReusedIsOmittedWhenUnknown(t *testing.T) {
	o := baseObs()
	o.Timings = &nettrace.Snapshot{} // e.g. the client stalled before any connection was obtained
	gw := byType(BuildEvents(o))["generation-update"].Body["metadata"].(map[string]any)["gateway"].(map[string]any)
	if _, has := gw["connReused"]; has {
		t.Error("connReused must be absent when no connection was obtained, not false")
	}
}
