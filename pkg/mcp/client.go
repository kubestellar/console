package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

// Client is a generic MCP client that communicates with an MCP server via stdio
type Client struct {
	name   string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	stderr io.ReadCloser
	mu     sync.Mutex
	idSeq  atomic.Int64
	// writeMu serializes writes to stdin independently of the main mu,
	// so a blocking write cannot deadlock callers that only need mu
	// for the pending map (#6944).
	writeMu sync.Mutex
	// pending maps request IDs (as strings) to response channels. IDs are
	// keyed as strings to avoid Go's JSON decoder returning numeric IDs as
	// float64 (from interface{} fields) while outgoing IDs are stored as
	// int64 — a type mismatch that caused every call() to block until the
	// context deadline fired (#6622).
	pending        map[string]chan *Response
	tools          []Tool
	ready          atomic.Bool // protected via atomic to avoid data races (#6942)
	done           chan struct{}
	stopOnce       sync.Once
	stdinCloseOnce sync.Once
}

// idKey converts a JSON-RPC request/response ID of any supported shape
// (int64, float64, json.Number, string) to the canonical string key used by
// the pending map. Returns "" if the value is nil or an unsupported type —
// callers should treat an empty key as "unroutable notification" and drop
// the response.
func idKey(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case int:
		return fmt.Sprintf("%d", t)
	case int64:
		return fmt.Sprintf("%d", t)
	case float64:
		// Integer-valued floats (the common case for JSON numeric IDs)
		// should match the int64 form exactly. Non-integer floats are
		// allowed by the JSON-RPC spec but we format with %g as a fallback.
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprintf("%g", t)
	case json.Number:
		return t.String()
	default:
		// #6655: align behavior with the docstring above — unsupported ID
		// types are treated as "unroutable" and produce an empty key so
		// callers drop the response instead of routing it via a bogus
		// fmt.Sprintf key that could never match an outgoing request.
		return ""
	}
}

// JSON-RPC types
type Request struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id,omitempty"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
}

type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// MCP types
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

type InputSchema struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties,omitempty"`
	Required   []string            `json:"required,omitempty"`
}

type Property struct {
	Type        string   `json:"type"`
	Description string   `json:"description,omitempty"`
	Enum        []string `json:"enum,omitempty"`
}

type InitializeParams struct {
	ProtocolVersion string     `json:"protocolVersion"`
	Capabilities    struct{}   `json:"capabilities"`
	ClientInfo      ClientInfo `json:"clientInfo"`
}

type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type InitializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	Capabilities    Capabilities `json:"capabilities"`
	ServerInfo      ServerInfo   `json:"serverInfo"`
}

type Capabilities struct {
	Tools *ToolsCapability `json:"tools,omitempty"`
}

type ToolsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ToolsListResult struct {
	Tools []Tool `json:"tools"`
}

type CallToolParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

type CallToolResult struct {
	Content []ContentItem `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

type ContentItem struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// mcpMaxResponseBytes is the largest single JSON-RPC response line we will
// accept from an MCP child process. #7959 — previously readResponses used an
// unbounded bufio.Reader.ReadBytes('\n'), so a buggy or malicious child that
// wrote an unterminated line could force the parent to accumulate bytes in
// memory until OOM. 1 MiB is far larger than any legitimate tool response
// and bounds worst-case memory per message.
const mcpMaxResponseBytes = 1 << 20 // 1 MiB

// NewClient creates a new MCP client for the given binary.
// The provided context is attached to the child process — when the context
// is canceled, the child receives a kill signal, enabling graceful shutdown.
func NewClient(ctx context.Context, name, binaryPath string, args ...string) (*Client, error) {
	cmd := exec.CommandContext(ctx, binaryPath, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdin.Close()
		stdout.Close()
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	client := &Client{
		name:    name,
		cmd:     cmd,
		stdin:   stdin,
		stdout:  bufio.NewReader(stdout),
		stderr:  stderr,
		pending: make(map[string]chan *Response),
		done:    make(chan struct{}),
	}

	return client, nil
}

// Start starts the MCP server process and initializes the connection.
// On failure, Stop() is called to reap the child process and terminate
// the readResponses goroutine, preventing goroutine and zombie leaks (#4729).
func (c *Client) Start(ctx context.Context) error {
	if err := c.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start %s: %w", c.name, err)
	}

	// Start reading responses
	safego.GoWith("mcp/read-responses", func() { c.readResponses() })

	// #7960 — Drain the child's stderr on a dedicated goroutine. Linux
	// pipe buffers default to 64 KiB; once a chatty MCP server fills it,
	// every further stderr write blocks and the child stalls. Logging the
	// drained lines via slog.Debug preserves diagnostics for operators
	// without blocking the child.
	safego.GoWith("mcp/drain-stderr", func() { c.drainStderr() })

	// Initialize the connection
	if err := c.initialize(ctx); err != nil {
		c.Stop() // clean up readResponses goroutine and child process
		return fmt.Errorf("failed to initialize %s: %w", c.name, err)
	}

	// Get available tools
	if err := c.listTools(ctx); err != nil {
		c.Stop() // clean up readResponses goroutine and child process
		return fmt.Errorf("failed to list tools from %s: %w", c.name, err)
	}

	c.ready.Store(true)
	return nil
}

// Stop stops the MCP server process and reaps the child to avoid zombie
// processes. Also closes the stderr pipe to release associated file
// descriptors (#4727).
//
// Stop is idempotent: calling it multiple times is safe and only the first
// invocation performs the shutdown. This matches the sync.Once pattern
// already used for other shutdown paths (#4727, #6478, #6586) and fixes
// the double-close panic when Stop was invoked more than once — for
// example, once by Bridge.Start rollback and once by Bridge.Stop (#6623).
func (c *Client) Stop() error {
	c.stopOnce.Do(func() {
		// #7397 — Reset readiness flag so health checks stop reporting the
		// client as available after the process has been killed.
		c.ready.Store(false)

		// Signal readResponses goroutine to exit
		close(c.done)

		// #7398 — Actively fail all in-flight RPC calls so callers unblock
		// immediately instead of waiting for context timeout.
		c.mu.Lock()
		for key, ch := range c.pending {
			select {
			case ch <- &Response{
				JSONRPC: "2.0",
				Error: &Error{
					Code:    -32000,
					Message: "client stopped",
				},
			}:
			default:
			}
			delete(c.pending, key)
		}
		c.mu.Unlock()

		// Close stdin pipe to send EOF to the server process
		c.closeStdin()

		if c.cmd != nil && c.cmd.Process != nil {
			// Kill the process, then Wait() to reap it and release OS resources
			// (process table entry, pipes, file descriptors).
			_ = c.cmd.Process.Kill()
			// Wait releases all resources associated with the Cmd.
			// The error from Wait is expected (killed process returns non-zero).
			_ = c.cmd.Wait()
		}

		// Close stderr pipe to release the file descriptor
		if c.stderr != nil {
			c.stderr.Close()
		}
	})

	return nil
}

// IsReady returns whether the client is ready to accept requests
func (c *Client) IsReady() bool {
	return c.ready.Load()
}

// Tools returns the list of available tools. #7974 — returns a defensive
// copy so callers that append or mutate the slice cannot race with the
// bridge's refresh goroutine or corrupt internal state.
func (c *Client) Tools() []Tool {
	if len(c.tools) == 0 {
		return nil
	}
	out := make([]Tool, len(c.tools))
	copy(out, c.tools)
	return out
}

// CallTool invokes a tool on the MCP server
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	if !c.ready.Load() {
		return nil, fmt.Errorf("client not ready")
	}

	params := CallToolParams{
		Name:      name,
		Arguments: args,
	}

	result, err := c.call(ctx, "tools/call", params)
	if err != nil {
		return nil, err
	}

	var toolResult CallToolResult
	if err := json.Unmarshal(result, &toolResult); err != nil {
		return nil, fmt.Errorf("failed to parse tool result: %w", err)
	}

	return &toolResult, nil
}

func (c *Client) initialize(ctx context.Context) error {
	params := InitializeParams{
		ProtocolVersion: "2024-11-05",
		ClientInfo: ClientInfo{
			Name:    "kubestellar-console",
			Version: "0.1.0",
		},
	}

	result, err := c.call(ctx, "initialize", params)
	if err != nil {
		return err
	}

	var initResult InitializeResult
	if err := json.Unmarshal(result, &initResult); err != nil {
		return fmt.Errorf("failed to parse initialize result: %w", err)
	}

	// Send initialized notification — propagate the error so callers
	// detect a failed write (e.g. child process died) (#6943).
	if err := c.notify("notifications/initialized", nil); err != nil {
		return fmt.Errorf("failed to send initialized notification: %w", err)
	}

	return nil
}

func (c *Client) listTools(ctx context.Context) error {
	result, err := c.call(ctx, "tools/list", nil)
	if err != nil {
		return err
	}

	var toolsResult ToolsListResult
	if err := json.Unmarshal(result, &toolsResult); err != nil {
		return fmt.Errorf("failed to parse tools list: %w", err)
	}

	c.tools = toolsResult.Tools
	return nil
}

func (c *Client) call(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	id := c.idSeq.Add(1)
	key := idKey(id)

	req := Request{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	respCh := make(chan *Response, 1)
	c.mu.Lock()
	c.pending[key] = respCh
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pending, key)
		c.mu.Unlock()
	}()

	if err := c.send(req); err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case resp := <-respCh:
		if resp.Error != nil {
			return nil, fmt.Errorf("RPC error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	}
}

func (c *Client) notify(method string, params interface{}) error {
	req := Request{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
	return c.send(req)
}

func (c *Client) closeStdin() {
	c.stdinCloseOnce.Do(func() {
		if c.stdin != nil {
			c.stdin.Close()
		}
	})
}

// stdinWriteTimeout is how long send() waits for a stdin write before
// giving up. If the child process stops consuming stdin the OS pipe
// buffer fills and Write blocks; this timeout prevents holding the
// write lock (and therefore all callers) indefinitely (#6944).
const stdinWriteTimeout = 30 * time.Second

func (c *Client) send(req Request) error {
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	data = append(data, '\n')

	// Use a dedicated write mutex so a blocked write cannot starve
	// callers that only need c.mu for the pending map (#6944).
	//
	// #7395 — If the write blocks past the timeout, close stdin to
	// unblock the goroutine so it releases writeMu instead of holding
	// it forever. The goroutine always unlocks writeMu via defer.
	type writeResult struct{ err error }
	ch := make(chan writeResult, 1)

	c.writeMu.Lock()
	safego.Go(func() {
		defer c.writeMu.Unlock()
		_, werr := c.stdin.Write(data)
		ch <- writeResult{err: werr}
	})

	select {
	case res := <-ch:
		if res.err != nil {
			return fmt.Errorf("failed to send request: %w", res.err)
		}
		return nil
	case <-time.After(stdinWriteTimeout):
		// Close stdin to unblock the stuck Write goroutine — this causes
		// Write to return with an error, releasing writeMu via defer.
		c.closeStdin()
		return fmt.Errorf("stdin write timed out after %s (child process may have stopped)", stdinWriteTimeout)
	case <-c.done:
		return fmt.Errorf("client stopped while writing to stdin")
	}
}

func (c *Client) readResponses() {
	// #7959 — Use bufio.Scanner with a bounded buffer so a child that writes
	// an unterminated line cannot force unbounded growth. The initial buffer
	// is small; Scanner will grow it up to mcpMaxResponseBytes on demand and
	// return bufio.ErrTooLong if a single line exceeds the cap.
	scanner := bufio.NewScanner(c.stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), mcpMaxResponseBytes)

	for scanner.Scan() {
		line := scanner.Bytes()

		var resp Response
		if err := json.Unmarshal(line, &resp); err != nil {
			// #7975 — Surface malformed responses at Warn so operators can
			// diagnose a broken plugin. Include a bounded prefix of the
			// offending line to aid triage without dumping the whole thing
			// into logs.
			const mcpWarnLinePrefix = 256 // bytes of the offending line logged for triage
			prefix := line
			if len(prefix) > mcpWarnLinePrefix {
				prefix = prefix[:mcpWarnLinePrefix]
			}
			slog.Warn("[MCP] malformed JSON response",
				"client", c.name,
				"error", err,
				"len", len(line),
				"prefix", string(prefix))
			continue
		}

		// Route response to waiting caller. Normalize the incoming ID via
		// idKey so that float64 (from default json.Unmarshal of interface{})
		// and int64 (from outgoing send) both map to the same pending-map
		// key (#6622).
		key := idKey(resp.ID)
		if key != "" {
			c.mu.Lock()
			ch, ok := c.pending[key]
			c.mu.Unlock()
			if ok {
				select {
				case ch <- &resp:
				case <-c.done:
					return
				}
			}
		}
	}

	// Scanner terminated — either clean EOF, a read error, or the line
	// exceeded mcpMaxResponseBytes (bufio.ErrTooLong).
	if err := scanner.Err(); err != nil {
		select {
		case <-c.done:
			// Client is stopping; suppress read errors.
		default:
			slog.Error("[MCP] read error", "client", c.name, "error", err)
		}
	}
}

// drainStderr continuously reads stderr from the MCP child and forwards
// each line to slog.Debug. #7960 — without this, the child blocks once the
// OS pipe buffer (64 KiB on Linux) fills with log output.
func (c *Client) drainStderr() {
	if c.stderr == nil {
		return
	}
	scanner := bufio.NewScanner(c.stderr)
	// Match the stdout reader's cap so a pathological child cannot force
	// unbounded growth on the stderr path either.
	scanner.Buffer(make([]byte, 0, 64*1024), mcpMaxResponseBytes)
	for scanner.Scan() {
		slog.Debug("[MCP] stderr", "client", c.name, "line", scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		select {
		case <-c.done:
			// Client is stopping; suppress stderr read errors.
		default:
			slog.Debug("[MCP] stderr drain ended", "client", c.name, "error", err)
		}
	}
}
