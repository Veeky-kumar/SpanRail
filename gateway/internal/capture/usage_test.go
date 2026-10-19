package capture

import (
	"reflect"
	"strings"
	"testing"
)

func TestParseUsageJSON(t *testing.T) {
	tests := []struct {
		name string
		body string
		want Usage
	}{
		{"openai chat", `{"id":"x","usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}`,
			Usage{"input": 12, "output": 5, "total": 17}},
		{"responses/anthropic style", `{"usage":{"input_tokens":7,"output_tokens":3}}`,
			Usage{"input": 7, "output": 3, "total": 10}},
		{"embeddings (no completion)", `{"usage":{"prompt_tokens":8,"total_tokens":8}}`,
			Usage{"input": 8, "total": 8}},
		{"only prompt tokens, total not invented", `{"usage":{"prompt_tokens":8}}`, Usage{"input": 8}},
		{"zero is a real value", `{"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}`,
			Usage{"input": 0, "output": 0, "total": 0}},
		{"no usage key", `{"id":"x"}`, nil},
		{"null usage", `{"usage":null}`, nil},
		{"empty usage", `{"usage":{}}`, nil},
		{"wrong types ignored", `{"usage":{"prompt_tokens":"12"}}`, nil},
		{"negative ignored", `{"usage":{"prompt_tokens":-1}}`, nil},
		{"not json", `<html>`, nil},
		{"truncated json", `{"usage":{"prompt_tokens":12`, nil},
		{"empty", ``, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseUsageJSON([]byte(tt.body))
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

const sseWithUsage = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}],\"usage\":null}\r\n\r\n" +
	"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":2,\"total_tokens\":11}}\n\n" +
	"data: [DONE]\n\n"

func TestSSEScannerFindsFinalUsage(t *testing.T) {
	s := NewSSEUsageScanner(1 << 20)
	if n, err := s.Write([]byte(sseWithUsage)); n != len(sseWithUsage) || err != nil {
		t.Fatalf("Write = %d, %v", n, err)
	}
	want := Usage{"input": 9, "output": 2, "total": 11}
	if got := s.Usage(); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// Network reads split the stream at arbitrary byte boundaries; the scanner must not care.
func TestSSEScannerIsChunkBoundaryIndependent(t *testing.T) {
	for _, size := range []int{1, 2, 3, 7, 13, 64} {
		s := NewSSEUsageScanner(1 << 20)
		for i := 0; i < len(sseWithUsage); i += size {
			end := min(i+size, len(sseWithUsage))
			_, _ = s.Write([]byte(sseWithUsage[i:end]))
		}
		want := Usage{"input": 9, "output": 2, "total": 11}
		if got := s.Usage(); !reflect.DeepEqual(got, want) {
			t.Errorf("chunk size %d: got %v", size, got)
		}
	}
}

func TestSSEScannerNoUsageIsUnknown(t *testing.T) {
	s := NewSSEUsageScanner(1 << 20)
	_, _ = s.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: [DONE]\n\n"))
	if got := s.Usage(); got != nil {
		t.Errorf("got %v, want nil", got)
	}
}

func TestSSEScannerOverlongLineIsSkippedNotBuffered(t *testing.T) {
	s := NewSSEUsageScanner(64)
	_, _ = s.Write([]byte("data: " + strings.Repeat("x", 10_000)))
	if len(s.buf) > 64 {
		t.Errorf("buffer grew to %d, cap is 64", len(s.buf))
	}
	// A normal line after the long one still parses.
	_, _ = s.Write([]byte("\ndata: {\"usage\":{\"prompt_tokens\":1}}\n"))
	if got := s.Usage(); !reflect.DeepEqual(got, Usage{"input": 1}) {
		t.Errorf("got %v", got)
	}
}
