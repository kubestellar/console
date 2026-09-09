package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// listTools() was reported at 0.0% coverage even though initialize() and
// call() are exercised. These tests hit its three arms directly using an
// io.Pipe-backed Client, mirroring TestClient_RPC_Flow / TestClient_RPC_Error.

func newPipeClient(t *testing.T) (*Client, *io.PipeReader, *io.PipeWriter) {
	t.Helper()
	inReader, inWriter := io.Pipe()
	outReader, outWriter := io.Pipe()
	c := &Client{
		name:    "test",
		stdin:   inWriter,
		stdout:  bufio.NewReader(outReader),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}
	c.ready.Store(true)
	go c.readResponses()
	t.Cleanup(func() { _ = c.Stop() })
	return c, inReader, outWriter
}

// respondOnce waits for one request on inReader and writes back either a
// successful result or an RPC error.
func respondOnce(t *testing.T, inReader *io.PipeReader, outWriter *io.PipeWriter, result json.RawMessage, rpcErr *Error) {
	t.Helper()
	scanner := bufio.NewScanner(inReader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	if !scanner.Scan() {
		t.Errorf("expected a request on stdin but scanner returned no data: %v", scanner.Err())
		return
	}
	var req Request
	if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
		t.Errorf("failed to parse request: %v", err)
		return
	}
	resp := Response{JSONRPC: "2.0", ID: req.ID, Result: result, Error: rpcErr}
	data, _ := json.Marshal(resp)
	if _, err := outWriter.Write(append(data, '\n')); err != nil {
		t.Errorf("failed to write response: %v", err)
	}
}

func TestClient_ListTools_Success(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	go respondOnce(t, inReader, outWriter,
		json.RawMessage(`{"tools":[{"name":"echo","description":"echoes","inputSchema":{"type":"object"}}]}`),
		nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	require.NoError(t, c.listTools(ctx))
	require.Len(t, c.tools, 1)
	assert.Equal(t, "echo", c.tools[0].Name)
	assert.Equal(t, "echoes", c.tools[0].Description)
}

func TestClient_ListTools_CallError(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// call() returns error when the server responds with an RPC error.
	go respondOnce(t, inReader, outWriter, nil, &Error{Code: -32601, Message: "method not found"})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.listTools(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "method not found")
	assert.Nil(t, c.tools)
}

func TestClient_ListTools_NilResult(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Empty successful response with no Result field — call() returns
	// (nil, nil), triggering listTools's `if result == nil` guard.
	go respondOnce(t, inReader, outWriter, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.listTools(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nil result from tools/list")
	assert.Nil(t, c.tools)
}

func TestClient_ListTools_MalformedJSON(t *testing.T) {
	c, inReader, outWriter := newPipeClient(t)

	// Result is valid JSON that call() will return, but it isn't a
	// ToolsListResult so json.Unmarshal into that struct fails.
	go respondOnce(t, inReader, outWriter, json.RawMessage(`"not-an-object"`), nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := c.listTools(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse tools list")
	assert.Nil(t, c.tools)
}
