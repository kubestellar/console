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
