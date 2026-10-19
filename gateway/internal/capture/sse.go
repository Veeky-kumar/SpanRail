package capture

import "bytes"

// SSEUsageScanner watches a Server-Sent Events stream as it passes by and remembers the
// last "data:" event that carried token usage, plus the first model name it saw. It is an
// io.Writer so it can sit in a tee; Write always reports full consumption and never fails,
// so it cannot disturb the stream.
//
// Memory is bounded: a single line longer than maxLine is skipped, not buffered.
type SSEUsageScanner struct {
	buf      []byte
	maxLine  int
	skipping bool
	usage    Usage
	model    string
}

// NewSSEUsageScanner returns a scanner that ignores lines longer than maxLine bytes.
func NewSSEUsageScanner(maxLine int) *SSEUsageScanner {
	return &SSEUsageScanner{maxLine: maxLine}
}

func (s *SSEUsageScanner) Write(p []byte) (int, error) {
	n := len(p)
	for len(p) > 0 {
		i := bytes.IndexByte(p, '\n')
		if i < 0 {
			s.add(p)
			break
		}
		s.add(p[:i])
		s.endLine()
		p = p[i+1:]
	}
	return n, nil
}

func (s *SSEUsageScanner) add(b []byte) {
	if s.skipping {
		return
	}
	if len(s.buf)+len(b) > s.maxLine {
		s.buf = s.buf[:0]
		s.skipping = true
		return
	}
	s.buf = append(s.buf, b...)
}

func (s *SSEUsageScanner) endLine() {
	if !s.skipping {
		line := bytes.TrimSuffix(s.buf, []byte("\r"))
		if rest, ok := bytes.CutPrefix(line, []byte("data:")); ok {
			rest = bytes.TrimSpace(rest)
			if s.model == "" && bytes.Contains(rest, []byte(`"model"`)) {
				s.model = ParseModelJSON(rest)
			}
			if bytes.Contains(rest, []byte(`"usage"`)) {
				// Only a complete usage counts. Anthropic-style streams end with a top-level usage
				// that holds just the output tokens (input is nested in an earlier event); taking
				// it would report "0 input tokens" when the truth is unknown.
				if u := ParseUsageJSON(rest); u != nil {
					_, hasIn := u["input"]
					_, hasOut := u["output"]
					if hasIn && hasOut {
						s.usage = u
					}
				}
			}
		}
	}
	s.buf = s.buf[:0]
	s.skipping = false
}

func (s *SSEUsageScanner) finish() {
	if len(s.buf) > 0 { // stream ended without a trailing newline
		s.endLine()
	}
}

// Usage returns the last usage seen, or nil if the stream carried none.
func (s *SSEUsageScanner) Usage() Usage {
	s.finish()
	return s.usage
}

// Model returns the first model name seen in the stream, or "".
func (s *SSEUsageScanner) Model() string {
	s.finish()
	return s.model
}
