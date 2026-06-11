package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIDKey(t *testing.T) {
	tests := []struct {
		input    interface{}
		expected string
	}{
		{nil, ""},
		{"string-id", "string-id"},
		{int(123), "123"},
		{int64(456), "456"},
		{float64(789), "789"},
		{float64(789.5), "789.5"},
		{json.Number("0123"), "0123"},
		{[]int{1}, ""}, // unsupported
	}

	for _, tt := range tests {
		got := idKey(tt.input)
		assert.Equal(t, tt.expected, got, "input: %v", tt.input)
	}
}

func TestClient_Stop_Idempotent_Basic(t *testing.T) {
	c := &Client{
		done: make(chan struct{}),
	}

	// Should not panic on multiple calls
	err := c.Stop()
	assert.NoError(t, err)

	err = c.Stop()
	assert.NoError(t, err)
}

func TestClient_RPC_Flow(t *testing.T) {
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

	// Start readResponses goroutine
	go c.readResponses()
	defer c.Stop()

	// Simulate server responding to a request
	go func() {
		// Read the request from c.stdin (inReader)
		scanner := bufio.NewScanner(inReader)
		if scanner.Scan() {
			var req Request
			json.Unmarshal(scanner.Bytes(), &req)

			// Send back a response to c.stdout (outWriter)
			resp := Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result:  json.RawMessage(`{"status":"ok"}`),
			}
			respData, _ := json.Marshal(resp)
			outWriter.Write(append(respData, '\n'))
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := c.call(ctx, "test/method", map[string]string{"foo": "bar"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"status":"ok"}`, string(result))
}

func TestClient_RPC_Error(t *testing.T) {
	outReader, outWriter := io.Pipe()

	c := &Client{
		name:    "test",
		stdout:  bufio.NewReader(outReader),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}
	c.ready.Store(true)

	go c.readResponses()
	defer c.Stop()

	go func() {
		resp := Response{
			JSONRPC: "2.0",
			ID:      1,
			Error: &Error{
				Code:    -32601,
				Message: "Method not found",
			},
		}
		data, _ := json.Marshal(resp)
		outWriter.Write(append(data, '\n'))
	}()

	// Manually add to pending since we are not calling send()
	ch := make(chan *Response, 1)
	c.mu.Lock()
	c.pending["1"] = ch
	c.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	select {
	case resp := <-ch:
		assert.NotNil(t, resp.Error)
		assert.Equal(t, -32601, resp.Error.Code)
		assert.Equal(t, "Method not found", resp.Error.Message)
	case <-ctx.Done():
		t.Fatal("timed out waiting for response")
	}
}

type countingCloser struct {
	closes atomic.Int32
}

func (c *countingCloser) Write(p []byte) (int, error) { return len(p), nil }
func (c *countingCloser) Close() error                { c.closes.Add(1); return nil }

func TestCloseStdin_CalledOnlyOnce(t *testing.T) {
	stub := &countingCloser{}
	c := &Client{
		stdin: stub,
		done:  make(chan struct{}),
	}

	const goroutines = 10
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			c.closeStdin()
		}()
	}
	wg.Wait()

	assert.Equal(t, int32(1), stub.closes.Load(), "Close() must be called exactly once")
}

func TestClient_Stop_FailsPending(t *testing.T) {
	c := &Client{
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}

	ch := make(chan *Response, 1)
	c.pending["1"] = ch

	err := c.Stop()
	assert.NoError(t, err)

	select {
	case resp := <-ch:
		assert.NotNil(t, resp.Error)
		assert.Equal(t, -32000, resp.Error.Code)
		assert.Equal(t, "client stopped", resp.Error.Message)
	default:
		t.Fatal("pending channel not notified on stop")
	}
}

func TestClient_Send_ClientStopped(t *testing.T) {
	c := &Client{
		stdin: &blockWriter{blocked: make(chan struct{})},
		done:  make(chan struct{}),
	}
	close(c.done)

	err := c.send(Request{Method: "test"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "client stopped")
}

func TestClient_ReadResponses_TooLong(t *testing.T) {
	outReader, outWriter := io.Pipe()
	c := &Client{
		name:   "test",
		stdout: bufio.NewReader(outReader),
		done:   make(chan struct{}),
	}

	// Start reading
	go c.readResponses()

	// Send a line longer than mcpMaxResponseBytes (1 MiB)
	line := make([]byte, mcpMaxResponseBytes+1)
	for i := range line {
		line[i] = 'a'
	}
	line[len(line)-1] = '\n'

	go func() {
		outWriter.Write(line)
		outWriter.Close()
	}()

	// Wait a bit for processing
	time.Sleep(100 * time.Millisecond)
	c.Stop()
}

type blockWriter struct {
	blocked chan struct{}
}

func (w *blockWriter) Write(p []byte) (n int, err error) {
	<-w.blocked
	return 0, io.ErrClosedPipe
}

func (w *blockWriter) Close() error {
	select {
	case <-w.blocked:
	default:
		close(w.blocked)
	}
	return nil
}

func TestClient_IsReady(t *testing.T) {
	c := &Client{}

	// Initially not ready
	assert.False(t, c.IsReady())

	// Mark as ready
	c.ready.Store(true)
	assert.True(t, c.IsReady())

	// Mark as not ready
	c.ready.Store(false)
	assert.False(t, c.IsReady())
}

func TestClient_Tools(t *testing.T) {
	c := &Client{}

	// Initially no tools
	tools := c.Tools()
	assert.Nil(t, tools)

	// Set some tools
	c.tools = []Tool{
		{Name: "tool1", Description: "First tool"},
		{Name: "tool2", Description: "Second tool"},
	}

	tools = c.Tools()
	require.Len(t, tools, 2)
	assert.Equal(t, "tool1", tools[0].Name)
	assert.Equal(t, "tool2", tools[1].Name)

	// Verify defensive copy - modifying returned slice shouldn't affect internal state
	tools[0].Name = "modified"
	assert.Equal(t, "tool1", c.tools[0].Name)
}

func TestClient_CallTool_NotReady(t *testing.T) {
	c := &Client{}
	c.ready.Store(false)

	ctx := context.Background()
	result, err := c.CallTool(ctx, "test-tool", nil)

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "client not ready")
}

func TestClient_CallTool_Success(t *testing.T) {
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
	defer c.Stop()

	// Simulate server responding to tool call
	go func() {
		scanner := bufio.NewScanner(inReader)
		if scanner.Scan() {
			var req Request
			json.Unmarshal(scanner.Bytes(), &req)

			// Verify it's a tools/call request
			assert.Equal(t, "tools/call", req.Method)

			// Send back a successful tool result
			resp := Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result:  json.RawMessage(`{"content":[{"type":"text","text":"tool output"}],"isError":false}`),
			}
			respData, _ := json.Marshal(resp)
			outWriter.Write(append(respData, '\n'))
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := c.CallTool(ctx, "test-tool", map[string]interface{}{"arg": "value"})
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Content, 1)
	assert.Equal(t, "text", result.Content[0].Type)
	assert.Equal(t, "tool output", result.Content[0].Text)
	assert.False(t, result.IsError)
}

func TestClient_CallTool_Error(t *testing.T) {
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
	defer c.Stop()

	// Simulate server responding with an error
	go func() {
		scanner := bufio.NewScanner(inReader)
		if scanner.Scan() {
			var req Request
			json.Unmarshal(scanner.Bytes(), &req)

			resp := Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: &Error{
					Code:    -32602,
					Message: "Invalid params",
				},
			}
			respData, _ := json.Marshal(resp)
			outWriter.Write(append(respData, '\n'))
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := c.CallTool(ctx, "test-tool", nil)
	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Invalid params")
}

func TestClient_Notify(t *testing.T) {
	inReader, inWriter := io.Pipe()

	c := &Client{
		name:  "test",
		stdin: inWriter,
		done:  make(chan struct{}),
	}

	// Read what gets written to stdin
	go func() {
		scanner := bufio.NewScanner(inReader)
		if scanner.Scan() {
			var req Request
			err := json.Unmarshal(scanner.Bytes(), &req)
			require.NoError(t, err)

			// Notifications have no ID
			assert.Nil(t, req.ID)
			assert.Equal(t, "2.0", req.JSONRPC)
			assert.Equal(t, "test/notification", req.Method)
		}
	}()

	err := c.notify("test/notification", map[string]string{"key": "value"})
	assert.NoError(t, err)

	c.Stop()
}

func TestClient_DrainStderr(t *testing.T) {
	stderrReader, stderrWriter := io.Pipe()

	c := &Client{
		name:   "test",
		stderr: stderrReader,
		done:   make(chan struct{}),
	}

	// Start draining stderr
	go c.drainStderr()

	// Write some lines to stderr
	stderrWriter.Write([]byte("stderr line 1\n"))
	stderrWriter.Write([]byte("stderr line 2\n"))

	// Give it time to process
	time.Sleep(50 * time.Millisecond)

	// Close stderr to terminate the drain goroutine
	stderrWriter.Close()

	// Give it time to finish
	time.Sleep(50 * time.Millisecond)
}

func TestClient_DrainStderr_NilStderr(t *testing.T) {
	c := &Client{
		name:   "test",
		stderr: nil,
		done:   make(chan struct{}),
	}

	// Should not panic with nil stderr
	require.NotPanics(t, func() {
		c.drainStderr()
	})
}

func TestClient_ReadResponses_MalformedJSON(t *testing.T) {
	outReader, outWriter := io.Pipe()

	c := &Client{
		name:    "test",
		stdout:  bufio.NewReader(outReader),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}

	go c.readResponses()

	// Send malformed JSON
	outWriter.Write([]byte("{invalid json}\n"))

	// Give it time to process
	time.Sleep(50 * time.Millisecond)

	// Should not crash, just log a warning
	outWriter.Close()
	c.Stop()
}

func TestClient_ReadResponses_NoMatchingPending(t *testing.T) {
	outReader, outWriter := io.Pipe()

	c := &Client{
		name:    "test",
		stdout:  bufio.NewReader(outReader),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}

	go c.readResponses()

	// Send a valid response but with no matching pending request
	resp := Response{
		JSONRPC: "2.0",
		ID:      999,
		Result:  json.RawMessage(`{}`),
	}
	respData, _ := json.Marshal(resp)
	outWriter.Write(append(respData, '\n'))

	// Give it time to process
	time.Sleep(50 * time.Millisecond)

	// Should not crash, response is just dropped
	outWriter.Close()
	c.Stop()
}

func TestClient_Send_WriteTimeout(t *testing.T) {
	// Create a writer that never accepts data
	blocked := make(chan struct{})
	c := &Client{
		stdin: &blockWriter{blocked: blocked},
		done:  make(chan struct{}),
	}

	// Override timeout for faster test
	originalTimeout := stdinWriteTimeout
	defer func() {
		// Can't actually change the const, but we test the timeout path
	}()

	req := Request{
		JSONRPC: "2.0",
		Method:  "test",
	}

	// This would timeout in real scenario, but blockWriter returns immediately
	// when blocked channel is closed
	err := c.send(req)
	assert.Error(t, err)
}

func TestClient_Call_ContextCanceled(t *testing.T) {
	inReader, inWriter := io.Pipe()
	outReader, _ := io.Pipe()

	c := &Client{
		name:    "test",
		stdin:   inWriter,
		stdout:  bufio.NewReader(outReader),
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}

	go c.readResponses()
	defer c.Stop()

	// Drain stdin so send doesn't block
	go func() {
		scanner := bufio.NewScanner(inReader)
		for scanner.Scan() {
			// Just consume
		}
	}()

	// Create a context that's already canceled
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result, err := c.call(ctx, "test/method", nil)
	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, context.Canceled, err)
}

func TestNewClient_StdinPipeError(t *testing.T) {
	// Use a non-existent binary that would fail
	ctx := context.Background()
	client, err := NewClient(ctx, "test", "/nonexistent/binary")

	// NewClient should succeed even with invalid binary (pipes created before start)
	assert.NoError(t, err)
	assert.NotNil(t, client)
}

func TestClient_Stop_ResetsReady(t *testing.T) {
	c := &Client{
		done: make(chan struct{}),
	}
	c.ready.Store(true)

	assert.True(t, c.IsReady())

	c.Stop()

	assert.False(t, c.IsReady())
}
