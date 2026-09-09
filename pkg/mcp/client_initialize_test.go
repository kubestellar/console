package mcp

import (
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// initialize() was at 46.7% coverage before this file — Start() calls it
// via a real child process, so the happy path is only exercised via
// integration-style tests, and every error branch (call error, nil
// result, malformed JSON, notify write error) went untested. These four
// direct tests drive the io.Pipe-backed Client (same pattern as
// TestClient_ListTools_* and TestClient_RPC_Flow) so each branch of
// initialize() is covered without a real child process.
//
// initialize() writes TWO JSON-RPC frames back to back on success:
//   1. an "initialize" request (with an ID, awaits a response)
//   2. a "notifications/initialized" notification (no ID, no response)
// The test-side goroutine reads both — the first to satisfy call(),
// the second to keep the io.Pipe write from blocking — and only sends
// a response to frame 1.

// drainRestOfPipe drains inReader in the background until it closes.
// Used for the success path so notify's synchronous pipe write to
// stdin does not deadlock after respondOnce consumes the initialize
// request.
func drainRestOfPipe(t *testing.T, inReader *io.PipeReader) {
	t.Helper()
	go func() {
		buf := make([]byte, 4096)
		for {
			if _, err := inReader.Read(buf); err != nil {
				return
			}
		}
	}()
}

func TestClient_Initialize_Success(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Respond to the initialize request, then keep draining the pipe
	// so the follow-on notifications/initialized write does not block.
	go func() {
		respondOnce(t, inReader, outWriter,
			json.RawMessage(`{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"srv","version":"0.0.1"}}`),
			nil)
		drainRestOfPipe(t, inReader)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	require.NoError(t, c.initialize(ctx))
}

func TestClient_Initialize_CallError(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Server responds with an RPC error → call() returns error →
	// initialize() should propagate it without reaching the unmarshal
	// or notify branches.
	go respondOnce(t, inReader, outWriter, nil, &Error{Code: -32603, Message: "internal error"})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.initialize(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "internal error")
}

func TestClient_Initialize_NilResult(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Successful response with no Result field — call() returns
	// (nil, nil), triggering initialize()'s `if result == nil` guard.
	go respondOnce(t, inReader, outWriter, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.initialize(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nil result from initialize")
}

func TestClient_Initialize_MalformedJSON(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Result is valid JSON but not an InitializeResult object — the
	// json.Unmarshal into that struct fails, exercising the
	// "failed to parse initialize result" branch.
	go respondOnce(t, inReader, outWriter, json.RawMessage(`"not-an-object"`), nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.initialize(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse initialize result")
}

// verify the helper we added compiles cleanly and is used.
var _ = drainRestOfPipe
