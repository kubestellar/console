package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// execAuthDeadline is how long the client has to send an auth message after connecting.
const execAuthDeadline = 5 * time.Second

// ExecHandlers handles pod exec API endpoints
type ExecHandlers struct {
	k8sClient *k8s.MultiClusterClient
	jwtSecret string
	devMode   bool
}

// NewExecHandlers creates a new exec handlers instance
func NewExecHandlers(k8sClient *k8s.MultiClusterClient, jwtSecret string, devMode bool) *ExecHandlers {
	return &ExecHandlers{
		k8sClient: k8sClient,
		jwtSecret: jwtSecret,
		devMode:   devMode,
	}
}

// execInitMessage is sent by the client to start an exec session
type execInitMessage struct {
	Type      string   `json:"type"`
	Cluster   string   `json:"cluster"`
	Namespace string   `json:"namespace"`
	Pod       string   `json:"pod"`
	Container string   `json:"container"`
	Command   []string `json:"command"`
	TTY       bool     `json:"tty"`
	Cols      uint16   `json:"cols"`
	Rows      uint16   `json:"rows"`
}

// execMessage is the framing for stdin/stdout/stderr/resize messages
type execMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Cols      uint16 `json:"cols,omitempty"`
	Rows      uint16 `json:"rows,omitempty"`
	ExitCode  int    `json:"exitCode,omitempty"`
}

// wsWriter adapts WebSocket writes to io.Writer for stdout/stderr
type wsWriter struct {
	conn    *websocket.Conn
	msgType string // "stdout" or "stderr"
	mu      *sync.Mutex
}

func (w *wsWriter) Write(p []byte) (int, error) {
	msg := execMessage{
		Type: w.msgType,
		Data: string(p),
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return 0, err
	}
	return len(p), nil
}

// wsReader adapts WebSocket reads to io.Reader for stdin
// It reads "stdin" type messages from a channel fed by the main read loop
type wsReader struct {
	ch  chan []byte
	buf []byte
}

func (r *wsReader) Read(p []byte) (int, error) {
	if len(r.buf) > 0 {
		n := copy(p, r.buf)
		r.buf = r.buf[n:]
		return n, nil
	}
	data, ok := <-r.ch
	if !ok {
		return 0, io.EOF
	}
	n := copy(p, data)
	if n < len(data) {
		r.buf = data[n:]
	}
	return n, nil
}

// terminalSizeQueue implements remotecommand.TerminalSizeQueue
type terminalSizeQueue struct {
	ch chan remotecommand.TerminalSize
}

func (q *terminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}

// execAuthMessage is the first message the client must send to authenticate
type execAuthMessage struct {
	Type  string `json:"type"`
	Token string `json:"token"`
}

// HandleExec handles a WebSocket connection for pod exec
func (h *ExecHandlers) HandleExec(c *websocket.Conn) {
	defer c.Close()

	// SECURITY: Require JWT authentication before allowing exec.
	// The client must send an {"type":"auth","token":"<jwt>"} message first.
	c.SetReadDeadline(time.Now().Add(execAuthDeadline))

	var authMsg execAuthMessage
	if err := c.ReadJSON(&authMsg); err != nil {
		slog.Error(fmt.Sprintf("SECURITY: exec: failed to read auth message: %v", err))
		writeError(c, "authentication required")
		return
	}

	if authMsg.Type != "auth" || authMsg.Token == "" {
		slog.Warn("SECURITY: exec: invalid or missing auth message")
		writeError(c, "authentication required")
		return
	}

	// Validate JWT token
	if authMsg.Token == "demo-token" {
		slog.Warn("SECURITY: exec: rejected demo-token (exec requires real authentication)")
		writeError(c, "exec requires real authentication, demo-token not allowed")
		return
	}

	if h.jwtSecret == "" {
		slog.Warn("SECURITY: exec: rejected connection (JWT secret not configured)")
		writeError(c, "server misconfiguration: authentication unavailable")
		return
	}

	claims, err := middleware.ValidateJWT(authMsg.Token, h.jwtSecret)
	if err != nil {
		slog.Warn(fmt.Sprintf("SECURITY: exec: rejected invalid token: %v", err))
		writeError(c, "invalid token")
		return
	}

	slog.Info(fmt.Sprintf("exec: authenticated user %s for pod exec", claims.GitHubLogin))

	// Clear read deadline after successful auth
	c.SetReadDeadline(time.Time{})

	if h.k8sClient == nil {
		writeError(c, "No Kubernetes client available")
		return
	}

	// Read the init message
	_, msg, err := c.ReadMessage()
	if err != nil {
		slog.Error(fmt.Sprintf("exec: failed to read init message: %v", err))
		return
	}

	var init execInitMessage
	if err := json.Unmarshal(msg, &init); err != nil {
		writeError(c, "Invalid init message")
		return
	}

	if init.Type != "exec_init" {
		writeError(c, "Expected exec_init message")
		return
	}

	if init.Cluster == "" || init.Namespace == "" || init.Pod == "" {
		writeError(c, "Missing cluster, namespace, or pod")
		return
	}

	// Default command
	if len(init.Command) == 0 {
		init.Command = []string{"/bin/sh"}
	}

	// Default terminal size
	const defaultCols = 80
	const defaultRows = 24
	if init.Cols == 0 {
		init.Cols = defaultCols
	}
	if init.Rows == 0 {
		init.Rows = defaultRows
	}

	// Get k8s client and REST config for the target cluster
	clientset, err := h.k8sClient.GetClient(init.Cluster)
	if err != nil {
		writeError(c, fmt.Sprintf("Failed to get client for cluster %s: %v", init.Cluster, err))
		return
	}

	restConfig, err := h.k8sClient.GetRestConfig(init.Cluster)
	if err != nil {
		writeError(c, fmt.Sprintf("Failed to get REST config for cluster %s: %v", init.Cluster, err))
		return
	}

	// Build the exec request
	req := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(init.Pod).
		Namespace(init.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: init.Container,
			Command:   init.Command,
			Stdin:     true,
			Stdout:    true,
			Stderr:    !init.TTY, // when TTY is on, stderr is merged into stdout
			TTY:       init.TTY,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", req.URL())
	if err != nil {
		writeError(c, fmt.Sprintf("Failed to create executor: %v", err))
		return
	}

	// Send exec_started acknowledgment
	startMsg, _ := json.Marshal(execMessage{Type: "exec_started"})
	writeMu := &sync.Mutex{}
	writeMu.Lock()
	_ = c.WriteMessage(websocket.TextMessage, startMsg)
	writeMu.Unlock()

	// Set up stdin reader, stdout/stderr writers, and resize queue
	stdinCh := make(chan []byte, 32)
	stdinReader := &wsReader{ch: stdinCh}

	stdoutWriter := &wsWriter{conn: c, msgType: "stdout", mu: writeMu}
	stderrWriter := &wsWriter{conn: c, msgType: "stderr", mu: writeMu}

	sizeQueue := &terminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, 4),
	}

	// Send initial terminal size
	sizeQueue.ch <- remotecommand.TerminalSize{Width: init.Cols, Height: init.Rows}

	// Create a cancellable context so that when the WebSocket client disconnects,
	// the exec stream is cancelled promptly — preventing goroutine and SPDY leaks.
	execCtx, execCancel := context.WithCancel(context.Background())
	defer execCancel()

	// Start a goroutine to read WebSocket messages and route them
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer close(stdinCh)
		defer execCancel() // cancel exec stream when client disconnects
		for {
			_, rawMsg, err := c.ReadMessage()
			if err != nil {
				return
			}

			var m execMessage
			if err := json.Unmarshal(rawMsg, &m); err != nil {
				continue
			}

			switch m.Type {
			case "stdin":
				select {
				case stdinCh <- []byte(m.Data):
				default:
					// Drop if channel full
				}
			case "resize":
				if m.Cols > 0 && m.Rows > 0 {
					select {
					case sizeQueue.ch <- remotecommand.TerminalSize{Width: m.Cols, Height: m.Rows}:
					default:
					}
				}
			}
		}
	}()

	// Execute the command — this blocks until the exec session ends
	streamOpts := remotecommand.StreamOptions{
		Stdin:  stdinReader,
		Stdout: stdoutWriter,
		Tty:    init.TTY,
	}
	if !init.TTY {
		streamOpts.Stderr = stderrWriter
	}
	if init.TTY {
		streamOpts.TerminalSizeQueue = sizeQueue
	}

	execErr := executor.StreamWithContext(execCtx, streamOpts)

	// Send exit message
	exitCode := 0
	if execErr != nil {
		exitCode = 1
		slog.Error(fmt.Sprintf("exec: stream ended with error: %v", execErr))
	}

	exitMsg, _ := json.Marshal(execMessage{Type: "exit", ExitCode: exitCode})
	writeMu.Lock()
	_ = c.WriteMessage(websocket.TextMessage, exitMsg)
	writeMu.Unlock()
}

func writeError(c *websocket.Conn, msg string) {
	errMsg, _ := json.Marshal(execMessage{Type: "error", Data: msg})
	_ = c.WriteMessage(websocket.TextMessage, errMsg)
}
