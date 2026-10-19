package capture

import "bytes"

// SSEUsageScanner watches a Server-Sent Events stream as it passes by and remembers the
// last "data:" event that carried token usage. It is an io.Writer so it can sit in a tee;
// Write always reports full consumption and never fails, so it cannot disturb the stream.
//
// Memory is bounded: a single line longer than maxLine is skipped, not buffered.
type SSEUsageScanner struct {
	buf      []byte
	maxLine  int
	skipping bool
	usage    Usage
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
		if rest, ok := bytes.CutPrefix(line, []byte("data:")); ok && bytes.Contains(rest, []byte(`"usage"`)) {
			if u := ParseUsageJSON(bytes.TrimSpace(rest)); u != nil {
				s.usage = u
			}
		}
	}
	s.buf = s.buf[:0]
	s.skipping = false
}

// Usage returns the last usage seen, or nil if the stream carried none.
func (s *SSEUsageScanner) Usage() Usage {
	if len(s.buf) > 0 { // stream ended without a trailing newline
		s.endLine()
	}
	return s.usage
}
