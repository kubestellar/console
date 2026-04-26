package agent

// kc-agent exec handler — Phase 3d-A of #7993.
//
// This is the kc-agent side of the pod exec WebSocket endpoint. It runs
// `kubectl exec`-equivalent SPDY streams against a target cluster using the
// *user's* kubeconfig (via the shared *k8s.MultiClusterClient), rather than
// the backend's pod ServiceAccount. That means the apiserver enforces RBAC
// against the real caller — no SubjectAccessReview (SAR) dance is required
// on this path, and the #5406 SECURITY WARNING that lives in the backend's
// exec handler (pkg/api/handlers/exec.go) does not apply.
//
// The original backend handler has a lot of machinery that is *specifically*
// needed because it used the pod SA:
//
//   - A first-message JWT auth handshake, because gofiber/websocket's upgrade
//     path strips HTTP middleware.
//   - A pods/exec SubjectAccessReview against the target cluster, faked with
//     a `github:<login>` impersonation subject, to decide whether the real
//     user (not the pod SA) is allowed to open a shell.
//   - A per-user session registry and a CancelUserExecSessions hook that the
//     logout handler fires to tear down live exec sessions on JWT revocation.
//
// kc-agent does not need any of that:
//
//   - Auth uses the existing s.validateToken(r) path (Authorization header
//     or the ?token= query param fallback that kc-agent's regular WebSocket
//     routes use; see server.go validateToken for why query param is
//     restricted to genuine WebSocket upgrades).
//   - RBAC is enforced natively by the target apiserver when we open the
//     SPDY exec stream using the user's kubeconfig context. A deny becomes a
//     synchronous stream-open error which we translate into a websocket
//     error frame.
//   - Session cancellation is handled by the WebSocket close / read-loop
//     exit firing execCancel via defer. kc-agent is a per-user local process
//     with no logout concept — if the user closes the browser tab, the
//     connection drops and the exec stream ends.
//
// What we keep, because it is independent of the pod-SA problem:
//
//   - The stdin drop telemetry (execStdinDropCount + rate-limited WARN log)
//     from PR 7995, so operators can still observe backpressure.
//   - The execMaxStdinBytes frame cap.
//   - The #7048 / #7778 ordering: drain the reader goroutine before closing
//     the terminal size queue channel to avoid a send-on-closed panic.
//   - Ping/pong keepalive so half-open TCP connections are detected within
//     execPongTimeout.
//   - The #6891 pattern: a write-side ping ticker + a read-side pong handler
//     that resets the read deadline.
//   - The terminal size queue for TTY resize events.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// Timeouts, buffer sizes, and other magic numbers are named constants with
// explanatory comments per the user's "no unnamed literals" rule. Values
// match the equivalent constants in pkg/api/handlers/exec.go so behaviour is
// identical to the backend handler wherever the pod-SA concerns don't apply.

// agentExecMaxStdinBytes is the maximum size of a single stdin frame. Larger
// frames are dropped with a WARN log at the drop site. Matches the backend's
// execMaxStdinBytes; protects against a runaway paste from exhausting memory.
const agentExecMaxStdinBytes = 1 * 1024 * 1024 // 1 MiB

// agentExecPingInterval is how often the server sends a WebSocket ping to
// detect dead peers. Matches the backend's execPingInterval.
const agentExecPingInterval = 30 * time.Second

// agentExecPongTimeout is how long the server waits for a pong reply before
// declaring the peer dead. Must be strictly greater than
// agentExecPingInterval so the deadline is always in the future when a new
// ping is sent. Matches the backend's execPongTimeout.
const agentExecPongTimeout = 45 * time.Second

// agentExecWriteDeadline bounds a single WebSocket frame write. Gorilla's
// API, unlike gofiber/contrib/websocket, requires callers to set a write
// deadline explicitly — without one a slow peer can pin a goroutine
// indefinitely. Short enough that a wedged client cannot DoS the writer,
// long enough to survive a jittery network hop.
const agentExecWriteDeadline = 10 * time.Second

// agentExecStdinBufferSize is the depth of the stdin channel that bridges
// the WebSocket read loop to the SPDY executor's Stdin io.Reader. Matches
// the backend's hardcoded value (32); changing this changes the threshold
// at which the drop branch fires.
const agentExecStdinBufferSize = 32

// agentExecResizeBufferSize is the depth of the terminal resize channel.
// Matches the backend's value (4). Resize messages are idempotent and
// dropping one is cosmetic (the next resize overwrites it).
const agentExecResizeBufferSize = 4

// agentExecDefaultCols / agentExecDefaultRows are the fallback terminal
// dimensions when the init message didn't supply them. Matches the backend's
// defaults (80x24 — a classic VT100 size).
const (
	agentExecDefaultCols = 80
	agentExecDefaultRows = 24
)

// agentExecStdinDropCount counts stdin frames that were discarded because
// the in-memory channel bridging the WebSocket to the SPDY executor was
// full. See the matching execStdinDropCount in pkg/api/handlers/exec.go
// (from PR 7995) — this is the kc-agent side of the same telemetry-first
// approach to the stdin backpressure problem (#7995). Exposed for tests.
var agentExecStdinDropCount atomic.Uint64

// GetAgentExecStdinDropCount returns the cumulative number of stdin frames
// that the kc-agent exec handler dropped due to a full channel since
// process start. Exported for tests and any future stats endpoint.
func GetAgentExecStdinDropCount() uint64 {
	return agentExecStdinDropCount.Load()
}

// agentExecInitMessage is the first JSON frame the client must send after
// the WebSocket upgrade. It names the target cluster, namespace, pod,
// container, and command, plus the initial terminal dimensions.
type agentExecInitMessage struct {
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

// agentExecMessage is the framing for stdin / stdout / stderr / resize /
// exit / error frames. Field tags match the backend handler's execMessage
// so the frontend does not need a per-host adapter.
type agentExecMessage struct {
	Type     string `json:"type"`
	Data     string `json:"data,omitempty"`
	Cols     uint16 `json:"cols,omitempty"`
	Rows     uint16 `json:"rows,omitempty"`
	ExitCode int    `json:"exitCode,omitempty"`
}

// agentWSWriter adapts a gorilla/websocket connection to an io.Writer suitable
// for remotecommand.StreamOptions.Stdout / Stderr. Each Write wraps the bytes
// in a JSON frame (matching the backend's wsWriter on the gofiber side) and
// sends them under a caller-supplied write mutex. A short write deadline is
// applied per frame so a stuck peer cannot wedge the SPDY executor.
type agentWSWriter struct {
	conn    *websocket.Conn
	msgType string // "stdout" or "stderr"
	mu      *sync.Mutex
}

func (w *agentWSWriter) Write(p []byte) (int, error) {
	msg := agentExecMessage{Type: w.msgType, Data: string(p)}
	data, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.conn.SetWriteDeadline(time.Now().Add(agentExecWriteDeadline)); err != nil {
		return 0, err
	}
	if err := w.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return 0, err
	}
	return len(p), nil
}

// agentWSReader bridges a stdin channel (fed by the main read loop) to the
// io.Reader interface the SPDY executor expects on StreamOptions.Stdin. Buf
// carries any bytes left over from a frame whose len() exceeded the caller's
// slice — the backend handler has an identical pattern in wsReader.
type agentWSReader struct {
	ch  chan []byte
	buf []byte
}

func (r *agentWSReader) Read(p []byte) (int, error) {
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

// agentTerminalSizeQueue implements remotecommand.TerminalSizeQueue.
type agentTerminalSizeQueue struct {
	ch chan remotecommand.TerminalSize
}

func (q *agentTerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}

// handleExec handles GET /ws/exec. The flow mirrors the backend handler's
// HandleExec (pkg/api/handlers/exec.go) minus the pod-SA-specific layers:
//
//  1. Token validation via the standard Authorization header or ?token=
//     query param fallback, the same way kc-agent's /ws route validates.
//  2. WebSocket upgrade via s.upgrader (gorilla).
//  3. Read and parse the agentExecInitMessage JSON frame.
//  4. Resolve the clientset and REST config for the target cluster from the
//     user's kubeconfig. The apiserver will enforce RBAC against the user
//     when we open the SPDY stream; no SAR pre-check is needed.
//  5. Build the SPDY executor and spin up three goroutines:
//     - ping ticker
//     - websocket read loop (stdin + resize)
//     - reader-drain sentinel (closed when read loop exits)
//  6. Block on executor.StreamWithContext until the session ends.
//  7. Drain the read loop, close the resize queue, and send the exit frame.
func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	// CORS + Private Network Access preflight (same pattern as handleWebSocket).
	if r.Method == http.MethodOptions {
		origin := r.Header.Get("Origin")
		if s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol")
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		slog.Warn("[AgentExec] SECURITY: rejected WebSocket — invalid or missing token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		http.Error(w, "k8s client not initialized", http.StatusServiceUnavailable)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("[AgentExec] WebSocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	// Keepalive — mirrors the backend handler's ping/pong scheme (#6891).
	// Each successful pong resets the read deadline; a half-open peer's
	// pong never arrives, the deadline fires, ReadMessage errors, and the
	// read loop exits — which cancels execCtx via defer.
	_ = conn.SetReadDeadline(time.Now().Add(agentExecPongTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(agentExecPongTimeout))
	})

	// Single cancellable context for the whole session. Cancelling it
	// unblocks executor.StreamWithContext and any goroutine selecting on
	// execCtx.Done().
	execCtx, execCancel := context.WithCancel(r.Context())
	defer execCancel()

	// Read the init message. The backend handler reads this AFTER the JWT
	// handshake; kc-agent reads it right after the upgrade since auth is
	// already verified above.
	_, rawInit, err := conn.ReadMessage()
	if err != nil {
		slog.Error("[AgentExec] failed to read init message", "error", err)
		return
	}
	var init agentExecInitMessage
	if err := json.Unmarshal(rawInit, &init); err != nil {
		agentExecWriteError(conn, "Invalid init message")
		return
	}
	if init.Type != "exec_init" {
		agentExecWriteError(conn, "Expected exec_init message")
		return
	}
	if init.Cluster == "" || init.Namespace == "" || init.Pod == "" {
		agentExecWriteError(conn, "Missing cluster, namespace, or pod")
		return
	}
	if len(init.Command) == 0 {
		init.Command = []string{"/bin/sh"}
	}
	if init.Cols == 0 {
		init.Cols = agentExecDefaultCols
	}
	if init.Rows == 0 {
		init.Rows = agentExecDefaultRows
	}

	slog.Info("[AgentExec] exec session",
		"cluster", init.Cluster,
		"namespace", init.Namespace,
		"pod", init.Pod,
		"container", init.Container,
		"command", init.Command,
		"tty", init.TTY,
	)

	// Resolve clientset + REST config for the target cluster. These come
	// from the user's kubeconfig via the shared *k8s.MultiClusterClient; the
	// apiserver will enforce RBAC against whatever identity that kubeconfig
	// presents when we open the stream, so the #5406 SECURITY WARNING that
	// applies to the backend handler does NOT apply here.
	clientset, err := s.k8sClient.GetClient(init.Cluster)
	if err != nil {
		agentExecWriteError(conn, fmt.Sprintf("Failed to get client for cluster %s: %v", init.Cluster, err))
		return
	}
	restConfig, err := s.k8sClient.GetRestConfig(init.Cluster)
	if err != nil {
		agentExecWriteError(conn, fmt.Sprintf("Failed to get REST config for cluster %s: %v", init.Cluster, err))
		return
	}

	// Build the pods/exec request. Stderr is merged into stdout when TTY is
	// on (same as the backend handler, matches kubectl behaviour).
	execReq := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(init.Pod).
		Namespace(init.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: init.Container,
			Command:   init.Command,
			Stdin:     true,
			Stdout:    true,
			Stderr:    !init.TTY,
			TTY:       init.TTY,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", execReq.URL())
	if err != nil {
		agentExecWriteError(conn, fmt.Sprintf("Failed to create executor: %v", err))
		return
	}

	// writeMu serializes every WriteMessage on conn so stdout / stderr /
	// ping / exit / error frames never race. Matches the backend's writeMu
	// pattern.
	writeMu := &sync.Mutex{}

	// Send the exec_started ack under writeMu so any subsequent writes that
	// land before StreamWithContext starts cannot race with this one.
	startMsg, mErr := json.Marshal(agentExecMessage{Type: "exec_started"})
	if mErr != nil {
		slog.Error("[AgentExec] failed to marshal exec_started message", "error", mErr)
		agentExecWriteError(conn, "internal error: failed to encode exec_started")
		return
	}
	writeMu.Lock()
	_ = conn.SetWriteDeadline(time.Now().Add(agentExecWriteDeadline))
	if writeErr := conn.WriteMessage(websocket.TextMessage, startMsg); writeErr != nil {
		writeMu.Unlock()
		slog.Error("[AgentExec] failed to send exec_started to client", "error", writeErr)
		return
	}
	writeMu.Unlock()

	// Channels bridging the WebSocket to the SPDY executor.
	stdinCh := make(chan []byte, agentExecStdinBufferSize)
	stdinReader := &agentWSReader{ch: stdinCh}

	stdoutWriter := &agentWSWriter{conn: conn, msgType: "stdout", mu: writeMu}
	stderrWriter := &agentWSWriter{conn: conn, msgType: "stderr", mu: writeMu}

	sizeQueue := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}
	sizeQueue.ch <- remotecommand.TerminalSize{Width: init.Cols, Height: init.Rows}

	// Ping goroutine — matches the backend handler's #6891 pattern. A
	// failed write means the peer is gone; cancel execCtx so the SPDY
	// executor exits.
	go func() {
		ticker := time.NewTicker(agentExecPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				writeMu.Lock()
				_ = conn.SetWriteDeadline(time.Now().Add(agentExecWriteDeadline))
				err := conn.WriteMessage(websocket.PingMessage, nil)
				writeMu.Unlock()
				if err != nil {
					execCancel()
					return
				}
			case <-execCtx.Done():
				return
			}
		}
	}()

	// Read loop — stdin and resize messages. `done` is closed when the loop
	// exits, so the main goroutine can wait for it before closing sizeQueue
	// (otherwise a late resize write would panic on send-to-closed, see
	// #7048 / #7778 in the backend handler).
	done := make(chan struct{})
	// sessionStdinDrops rate-limits the drop WARN log to power-of-two
	// session counts so a sustained backpressure burst does not flood the
	// journal. Matches the backend handler's per-session throttling.
	var sessionStdinDrops uint64
	go func() {
		defer close(done)
		defer close(stdinCh)
		defer execCancel()
		for {
			_, rawMsg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var m agentExecMessage
			if err := json.Unmarshal(rawMsg, &m); err != nil {
				continue
			}
			switch m.Type {
			case "stdin":
				if len(m.Data) > agentExecMaxStdinBytes {
					slog.Warn("[AgentExec] dropping oversized stdin message",
						"bytes", len(m.Data),
						"limit", agentExecMaxStdinBytes)
					continue
				}
				select {
				case stdinCh <- []byte(m.Data):
				default:
					totalDrops := agentExecStdinDropCount.Add(1)
					sessionStdinDrops++
					// x & (x-1) == 0 iff x is a power of two (1, 2, 4, 8, ...)
					if sessionStdinDrops&(sessionStdinDrops-1) == 0 {
						slog.Warn("[AgentExec] dropping stdin frame — channel full",
							"bytes", len(m.Data),
							"buffer", cap(stdinCh),
							"session_drops", sessionStdinDrops,
							"total_drops", totalDrops)
					}
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

	// Block on the SPDY executor until the session ends.
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

	// #7048 — Wait for the reader goroutine to finish before closing the
	// size queue channel. The reader may still be pushing resize events;
	// closing first would panic on send-to-closed (#7778).
	<-done
	close(sizeQueue.ch)

	exitCode := 0
	if execErr != nil {
		exitCode = 1
		slog.Error("[AgentExec] stream ended with error", "error", execErr)
	}
	exitMsg, mErr := json.Marshal(agentExecMessage{Type: "exit", ExitCode: exitCode})
	if mErr != nil {
		slog.Error("[AgentExec] failed to marshal exit message", "error", mErr, "exit_code", exitCode)
		return
	}
	writeMu.Lock()
	_ = conn.SetWriteDeadline(time.Now().Add(agentExecWriteDeadline))
	_ = conn.WriteMessage(websocket.TextMessage, exitMsg)
	writeMu.Unlock()
}

// agentExecWriteError sends a one-shot "error" frame to the client. Callers
// invoke this before the main writeMu exists (during init) so we create a
// throwaway mutex locally — the caller is expected to return immediately
// after, so no other write can race.
func agentExecWriteError(conn *websocket.Conn, msg string) {
	errMsg, _ := json.Marshal(agentExecMessage{Type: "error", Data: msg})
	_ = conn.SetWriteDeadline(time.Now().Add(agentExecWriteDeadline))
	_ = conn.WriteMessage(websocket.TextMessage, errMsg)
}
