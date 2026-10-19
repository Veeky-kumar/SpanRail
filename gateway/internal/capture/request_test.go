package capture

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPeekRequest(t *testing.T) {
	big := `{"model":"gpt-4o","stream":true,"messages":[{"role":"user","content":"` + strings.Repeat("a", 5000) + `"}]}`
	tests := []struct {
		name      string
		body      string
		limit     int64
		wantModel string
	}{
		{"simple", `{"model":"gpt-4o-mini","messages":[]}`, 1024, "gpt-4o-mini"},
		{"stream flag", `{"stream":true,"model":"m"}`, 1024, "m"},
		{"model after big value within limit", `{"messages":[{"content":"x"}],"model":"late"}`, 1024, "late"},
		{"body larger than limit, model at front", big, 128, "gpt-4o"},
		{"model beyond limit is unknown", `{"messages":"` + strings.Repeat("a", 500) + `","model":"late"}`, 128, ""},
		{"non-string model ignored", `{"model":42}`, 1024, ""},
		{"not json", `hello`, 1024, ""},
		{"empty", ``, 1024, ""},
		{"json array", `[1,2]`, 1024, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tt.body))
			info, err := PeekRequest(r, tt.limit)
			if err != nil {
				t.Fatal(err)
			}
			if info.Model != tt.wantModel {
				t.Errorf("model=%q, want %q", info.Model, tt.wantModel)
			}
			if int64(len(info.Prefix)) > tt.limit {
				t.Errorf("prefix %d bytes exceeds limit %d", len(info.Prefix), tt.limit)
			}
			// The upstream must still receive every byte.
			got, _ := io.ReadAll(r.Body)
			if string(got) != tt.body {
				t.Errorf("forwarded body differs (len %d vs %d)", len(got), len(tt.body))
			}
		})
	}
}

func TestPeekRequestNilBody(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Body = nil
	info, err := PeekRequest(r, 100)
	if err != nil || info.Model != "" {
		t.Fatalf("info=%+v err=%v", info, err)
	}
}

type failingReader struct{ data []byte }

func (f *failingReader) Read(p []byte) (int, error) {
	if len(f.data) > 0 {
		n := copy(p, f.data)
		f.data = f.data[n:]
		return n, nil
	}
	return 0, errors.New("connection reset")
}

func TestPeekRequestReadErrorSurfacesToUpstreamRead(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	r.Body = io.NopCloser(&failingReader{data: []byte(`{"model":"m"`)})
	info, err := PeekRequest(r, 1024)
	if err == nil || string(info.Prefix) != `{"model":"m"` {
		t.Fatalf("peek should report the read error and still return the prefix: %q, %v", info.Prefix, err)
	}
	got, err := io.ReadAll(r.Body) // the same error replays after the prefix
	if err == nil || !bytes.Equal(got, []byte(`{"model":"m"`)) {
		t.Errorf("got %q, err %v; want prefix then error", got, err)
	}
}
