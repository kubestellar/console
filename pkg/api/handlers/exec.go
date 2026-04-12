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
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// execAuthDeadline is how long the client has to send an auth message after connecting.
const execAuthDeadline = 5 * time.Second

// execMaxStdinBytes is the maximum allowed size of a single stdin message.
// Messages exceeding this limit are silently dropped to prevent memory exhaustion.
const execMaxStdinBytes = 1 * 1024 * 1024 // 1 MB

// execPingInterval is how often the server sends a WebSocket ping to detect dead peers.
const execPingInterval = 30 * time.Second

// execPongTimeout is how long the server waits for a pong reply before declaring
// the peer dead. Must be greater than execPingInterval so the deadline is always
// in the future when a new ping is sent.
const execPongTimeout = 45 * time.Second

// execSessionRegistry tracks active exec sessions per user so that
// CancelUserExecSessions can tear them down on logout (#6024).
//
// The /ws/exec handler does not register with the WebSocket Hub (it runs its
// own read loop and does not exchange JSON frames with the hub), so the
// Hub.DisconnectUser path used by Logout cannot see exec sessions. This
// registry bridges that gap: when a new exec session's stream context is
// created, the cancel function is recorded here keyed by userID. On logout,
// CancelUserExecSessions runs every recorded cancel for that user, which
// unblocks executor.StreamWithContext and causes the WebSocket handler to
// exit its goroutines and close the connection.
//
// A regular sync.Mutex is used (not RWMutex) because writes (add/remove on
// session start/end) and reads (CancelUserExecSessions on logout) are both
// infrequent and always short; an RWMutex would add complexity for no gain.
var (
	execSessionsMu sync.Mutex
	execSessions = make(map[uuid.UUID]map[uint64]context.CancelFunc)
	// execSessionSeq is a monotonic id generator guarded by execSessionsMu.
	// uint64 so we don't wrap to negative at MaxInt64.
	execSessionSeq uint64
)

// registerExecSession records cancel under userID and returns the assigned
// session id. The session id is used by unregisterExecSession to remove the
// specific entry when the session ends normally, so the map does not grow
// unbounded across many sessions by the same user.
func registerExecSession(userID uuid.UUID, cancel context.CancelFunc) uint64 {
	execSessionsMu.Lock()
	defer execSessionsMu.Unlock()
	execSessionSeq++
	id := execSessionSeq
	sessions, ok := execSessions[userID]
	if !ok {
		sessions = make(map[uint64]context.CancelFunc)
		execSessions[userID] = sessions
	}
	sessions[id] = cancel
	return id
}

// unregisterExecSession removes a single session entry. Called from the exec
// handler's deferred cleanup on normal session end so the registry stays
// bounded by the number of concurrently live exec sessions, not the total
// lifetime count.
func unregisterExecSession(userID uuid.UUID, id uint64) {
	execSessionsMu.Lock()
	defer execSessionsMu.Unlock()
	sessions, ok := execSessions[userID]
	if !ok {
		return
	}
	delete(sessions, id)
	if len(sessions) == 0 {
		delete(execSessions, userID)
	}
}

// CancelUserExecSessions cancels every active exec session belonging to the
// given user and clears the entries from the registry. Called from the auth
// Logout handler after revoking the JWT so that any pod shell the user had
// open stops accepting input and unblocks the StreamWithContext goroutine
// (#6024). Safe to call with a userID that has no live sessions.
func CancelUserExecSessions(userID uuid.UUID) {
	execSessionsMu.Lock()
	sessions, ok := execSessions[userID]
	if !ok {
		execSessionsMu.Unlock()
		return
	}
	// Take ownership of the cancel funcs under the lock, then release the
	// lock before invoking them. Calling cancel() itself is cheap but the
	// goroutines it unblocks may contend for other locks; holding
	// execSessionsMu across those is unnecessary and risks deadlock.
	cancels := make([]context.CancelFunc, 0, len(sessions))
	for _, c := range sessions {
		cancels = append(cancels, c)
	}
	delete(execSessions, userID)
	execSessionsMu.Unlock()

	for _, cancel := range cancels {
		cancel()
	}
	slog.Info("[Exec] cancelled exec sessions for user", "user", userID, "count", len(cancels))
}

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
		slog.Error("[Exec] SECURITY: failed to read auth message", "error", err)
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
		slog.Warn("[Exec] SECURITY: rejected invalid token", "error", err)
		writeError(c, "invalid token")
		return
	}

	// SECURITY WARNING (#5406): This handler validates authentication (JWT) but
	// does NOT perform authorization. Any authenticated user can open a shell to
	// any pod in any cluster. Full RBAC scoping requires checking the user's
	// Kubernetes RBAC permissions (SubjectAccessReview with "create" verb on
	// "pods/exec" in the target namespace/cluster) before establishing the exec
	// session. This is a known limitation tracked in issue #5406.
	slog.Warn("[Exec] SECURITY: pod exec session opened — no authorization check performed",
		"user", claims.GitHubLogin,
		"user_id", claims.UserID,
		"remote_addr", c.RemoteAddr().String(),
	)

	// Set up ping/pong heartbeat to detect dead peers (#6891).
	// The pong handler resets the read deadline each time the client replies,
	// so a half-open TCP connection (hard power failure, network drop) is
	// detected within execPongTimeout and ReadMessage unblocks with an error.
	c.SetReadDeadline(time.Now().Add(execPongTimeout))
	c.SetPongHandler(func(string) error {
		return c.SetReadDeadline(time.Now().Add(execPongTimeout))
	})

	// Create the cancellable context and register it BEFORE any of the long-
	// running setup (init message read, k8s client lookup, executor build).
	// Without this, there is a race window: the user authenticates, then
	// logs out before the registration call below, and CancelUserExecSessions
	// has nothing to cancel — the about-to-start exec session leaks past
	// logout. Registering up-front shrinks the window to roughly zero
	// because the context is already in the per-user registry when the
	// long-running operations begin (#6075).
	execCtx, execCancel := context.WithCancel(context.Background())
	defer execCancel()

	var execRegistrationID uint64
	if claims.UserID != uuid.Nil {
		execRegistrationID = registerExecSession(claims.UserID, execCancel)
		defer unregisterExecSession(claims.UserID, execRegistrationID)
	}

	if h.k8sClient == nil {
		writeError(c, "No Kubernetes client available")
		return
	}

	// Read the init message
	_, msg, err := c.ReadMessage()
	if err != nil {
		slog.Error("[Exec] failed to read init message", "error", err)
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

	// SECURITY: Log exec target details for audit trail (#5406)
	slog.Warn("[Exec] SECURITY: exec session targeting pod",
		"user", claims.GitHubLogin,
		"user_id", claims.UserID,
		"cluster", init.Cluster,
		"namespace", init.Namespace,
		"pod", init.Pod,
		"container", init.Container,
		"command", init.Command,
	)

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
	startMsg, mErr := json.Marshal(execMessage{Type: "exec_started"})
	if mErr != nil {
		slog.Error("[Exec] failed to marshal exec_started message", "error", mErr)
		writeError(c, "internal error: failed to encode exec_started")
		return
	}
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

	// execCtx / execCancel were created up-front (right after JWT validation)
	// so the registry is populated before any long-running setup. See the
	// comment above for the race-window rationale (#6075).

	// Start a goroutine that sends periodic WebSocket pings (#6891).
	// If the client has silently disconnected (half-open TCP), the pong
	// never arrives, the read deadline expires, ReadMessage returns an
	// error, and execCancel fires — preventing zombie goroutines.
	go func() {
		ticker := time.NewTicker(execPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				writeMu.Lock()
				err := c.WriteMessage(websocket.PingMessage, nil)
				writeMu.Unlock()
				if err != nil {
					// Write failed — peer is gone; cancel to unblock stream.
					execCancel()
					return
				}
			case <-execCtx.Done():
				return
			}
		}
	}()

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
				if len(m.Data) > execMaxStdinBytes {
					slog.Warn("[Exec] dropping oversized stdin message", "bytes", len(m.Data), "limit", execMaxStdinBytes)
					continue
				}
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
		slog.Error("[Exec] stream ended with error", "error", execErr)
	}

	exitMsg, mErr := json.Marshal(execMessage{Type: "exit", ExitCode: exitCode})
	if mErr != nil {
		slog.Error("[Exec] failed to marshal exit message", "error", mErr, "exit_code", exitCode)
		return
	}
	writeMu.Lock()
	_ = c.WriteMessage(websocket.TextMessage, exitMsg)
	writeMu.Unlock()
}

func writeError(c *websocket.Conn, msg string) {
	errMsg, _ := json.Marshal(execMessage{Type: "error", Data: msg})
	_ = c.WriteMessage(websocket.TextMessage, errMsg)
}
