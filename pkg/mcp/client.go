package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"sync/atomic"
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
	// pending maps request IDs (as strings) to response channels. IDs are
	// keyed as strings to avoid Go's JSON decoder returning numeric IDs as
	// float64 (from interface{} fields) while outgoing IDs are stored as
	// int64 — a type mismatch that caused every call() to block until the
	// context deadline fired (#6622).
	pending  map[string]chan *Response
	tools    []Tool
	ready    bool
	done     chan struct{}
	stopOnce sync.Once
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

// NewClient creates a new MCP client for the given binary
func NewClient(name, binaryPath string, args ...string) (*Client, error) {
	cmd := exec.Command(binaryPath, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
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
	go c.readResponses()

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

	c.ready = true
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
		// Signal readResponses goroutine to exit
		close(c.done)

		// Close stdin pipe to send EOF to the server process
		if c.stdin != nil {
			c.stdin.Close()
		}

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
	return c.ready
}

// Tools returns the list of available tools
func (c *Client) Tools() []Tool {
	return c.tools
}

// CallTool invokes a tool on the MCP server
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (*CallToolResult, error) {
	if !c.ready {
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

	// Send initialized notification
	c.notify("notifications/initialized", nil)

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

func (c *Client) send(req Request) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	data = append(data, '\n')
	if _, err := c.stdin.Write(data); err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}

	return nil
}

func (c *Client) readResponses() {
	for {
		line, err := c.stdout.ReadBytes('\n')
		if err != nil {
			if err != io.EOF {
				select {
				case <-c.done:
					// Client is stopping; suppress read errors
				default:
					fmt.Printf("[%s] read error: %v\n", c.name, err)
				}
			}
			return
		}

		var resp Response
		if err := json.Unmarshal(line, &resp); err != nil {
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
}
