package fakespanrail

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSinkCountsEventsByType(t *testing.T) {
	s := &Sink{}
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	body := `{"batch":[{"type":"trace-create","body":{"id":"a"}},{"type":"generation-create","body":{"id":"b"}},{"type":"generation-update","body":{"id":"b"}}]}`
	resp, err := http.Post(srv.URL+"/api/public/ingestion", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var out struct{ Successes, Errors []map[string]any }
	_ = json.NewDecoder(resp.Body).Decode(&out)
	resp.Body.Close()
	if resp.StatusCode != 207 || len(out.Successes) != 3 || len(out.Errors) != 0 {
		t.Errorf("status=%d successes=%d errors=%d", resp.StatusCode, len(out.Successes), len(out.Errors))
	}
	if s.Events() != 3 {
		t.Errorf("Events() = %d", s.Events())
	}

	r2, _ := http.Get(srv.URL + "/stats")
	b, _ := io.ReadAll(r2.Body)
	r2.Body.Close()
	if !strings.Contains(string(b), `"generation-create":1`) || !strings.Contains(string(b), `"requests":1`) {
		t.Errorf("stats = %s", b)
	}
}

func TestSinkRejectsGarbage(t *testing.T) {
	srv := httptest.NewServer((&Sink{}).Handler())
	defer srv.Close()
	resp, _ := http.Post(srv.URL+"/api/public/ingestion", "application/json", strings.NewReader("nope"))
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
