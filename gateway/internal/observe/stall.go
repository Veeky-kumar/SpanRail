package observe

import (
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/veeky-ai/spanrail-gateway/internal/capture"
)

// stallGuard wraps a request body so that a client which stops sending is cut off, without
// penalising a client that is merely slow.
//
// Before every Read it moves the connection's read deadline to now+timeout. So the deadline
// only expires if a single Read waits that long for the next bytes, i.e. nothing arrived. At
// EOF the deadline is cleared: net/http then watches the connection to notice the client
// leaving, and a stale deadline would make it cancel a long-running upstream call.
//
// Errors other than EOF are wrapped as ClientBodyError so the proxy can tell them apart from
// upstream failures.
type stallGuard struct {
	body    io.ReadCloser
	rc      *http.ResponseController
	timeout time.Duration
	flag    *capture.StallFlag
}

func (g *stallGuard) Read(p []byte) (int, error) {
	_ = g.rc.SetReadDeadline(time.Now().Add(g.timeout))
	n, err := g.body.Read(p)
	switch {
	case err == nil:
	case err == io.EOF:
		_ = g.rc.SetReadDeadline(time.Time{})
	default:
		if errors.Is(err, os.ErrDeadlineExceeded) {
			g.flag.Set()
		}
		err = &capture.ClientBodyError{Err: err}
	}
	return n, err
}

func (g *stallGuard) Close() error { return g.body.Close() }
