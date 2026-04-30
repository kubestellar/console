package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

// maxWSGoroutines limits concurrent chat/kubectl goroutines per connection
// to prevent resource exhaustion from bursty or malicious traffic (#7277).
const maxWSGoroutines = 20

// activeChatEntry pairs an in-progress session's context cancel function with
// the WebSocket connection that started it. Storing the conn reference allows
// handleCancelChat to verify the cancelling client owns the session, preventing
// cross-session cancellation (CSRF/bypass — #9712).
type activeChatEntry struct {
	cancel context.CancelFunc
	// conn is the WebSocket connection that registered this session.
	// It is used as an ownership key: only the originating connection may
	// cancel the session via the WebSocket cancel path. The HTTP cancel path
	// (handleCancelChatHTTP) is separately guarded by validateToken.
	conn *websocket.Conn
}

// cmdPrefixRe matches lines like "CMD: ...", "CMD:...", "Command: ...", or "command: ..."
// used by extractCommandsFromResponse to parse mixed-mode thinking output (#9440).
var cmdPrefixRe = regexp.MustCompile(`(?i)^(?:cmd|command)\s*:\s*(.+)`)

// codeBlockCmdRe matches kubectl/helm/oc commands inside markdown code blocks (#9440).
var codeBlockCmdRe = regexp.MustCompile(`^\s*(kubectl|helm|oc)\s+.+`)

// wsMaxMessageBytes caps the size of any single WebSocket frame the agent
// will accept from a client. Without this, an authenticated client could
// send arbitrarily large prompts that get forwarded to paid LLM APIs.
const wsMaxMessageBytes = 1 << 20 // 1 MB

// maxPromptChars caps the per-request prompt length forwarded to LLM
// providers. Set well above interactive use but below the WebSocket frame
// limit to keep cost and latency bounded.
const maxPromptChars = 100_000

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Handle CORS preflight for Private Network Access (required by Chrome 104+)
	if r.Method == http.MethodOptions {
		s.setCORSHeaders(w, r, http.MethodGet, http.MethodOptions)
		// WebSocket upgrades need additional headers beyond what setCORSHeaders provides
		w.Header().Add("Access-Control-Allow-Headers", "Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token if configured
	if !s.validateToken(r) {
		slog.Warn("SECURITY: Rejected WebSocket connection - invalid or missing token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()
	conn.SetReadLimit(wsMaxMessageBytes)

	wsc := &wsClient{}
	s.clientsMux.Lock()
	s.clients[conn] = wsc
	s.clientsMux.Unlock()

	defer func() {
		s.clientsMux.Lock()
		delete(s.clients, conn)
		s.clientsMux.Unlock()
	}()

	slog.Info("client connected", "addr", conn.RemoteAddr(), "origin", r.Header.Get("Origin"))

	// writeMu is the single per-connection mutex shared by broadcasts
	// (prediction_worker) and request/stream handlers. Using the same
	// mutex prevents concurrent gorilla/websocket writes that would
	// panic or corrupt connection state.
	writeMu := &wsc.writeMu
	// closed is set when the read loop exits; goroutines check it before writing
	var closed atomic.Bool

	// connCtx is cancelled when the WebSocket read loop exits (client disconnect).
	// AI goroutines derive their context from connCtx so that in-progress
	// StreamChat calls are interrupted immediately on disconnect (#9709).
	connCtx, connCancel := context.WithCancel(context.Background())
	defer connCancel()

	// Semaphore to limit concurrent work goroutines per connection (#7277)
	sem := make(chan struct{}, maxWSGoroutines)

	// --- Ping/pong keepalive to detect dead connections ---
	// Set initial read deadline; each pong resets it.
	conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
		return nil
	})

	// Pinger goroutine: sends pings periodically. Exits when connection closes
	// or the read loop exits (stopPing closed).
	stopPing := make(chan struct{})
	go func() {
		ticker := time.NewTicker(wsPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				writeMu.Lock()
				conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				err := conn.WriteMessage(websocket.PingMessage, nil)
				conn.SetWriteDeadline(time.Time{}) // clear deadline for normal writes
				writeMu.Unlock()
				if err != nil {
					return // connection dead
				}
			case <-stopPing:
				return
			}
		}
	}()

	for {
		var msg protocol.Message
		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("WebSocket error", "error", err)
			}
			break
		}
		// Reset read deadline after each successful read (active client)
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))

		// For chat messages, run in a goroutine so cancel messages can be received.
		// Goroutine count is bounded by a semaphore to prevent resource exhaustion (#7277).
		if msg.Type == protocol.TypeChat || msg.Type == protocol.TypeClaude {
			forceAgent := ""
			if msg.Type == protocol.TypeClaude {
				forceAgent = "claude"
			}
			sem <- struct{}{} // acquire slot
			go func(m protocol.Message, fa string) {
				defer func() { <-sem }() // release slot
				defer func() {
					if r := recover(); r != nil {
						slog.Error("[Chat] recovered from panic in streaming handler", "panic", r)
						// Send error frame to the client so the frontend
						// can display an error state instead of spinning forever.
						if !closed.Load() {
							writeMu.Lock()
							conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
							_ = conn.WriteJSON(protocol.Message{
								ID:      m.ID,
								Type:    protocol.TypeError,
								Payload: protocol.ErrorPayload{Code: "panic", Message: "Internal server error during chat streaming"},
							})
							conn.SetWriteDeadline(time.Time{})
							writeMu.Unlock()
						}
					}
				}()
				s.handleChatMessageStreaming(connCtx, conn, m, fa, writeMu, &closed)
			}(msg, forceAgent)
		} else if msg.Type == protocol.TypeCancelChat {
			// Cancel an in-progress chat by session ID
			s.handleCancelChat(conn, msg, writeMu)
		} else if msg.Type == protocol.TypeKubectl {
			// Handle kubectl messages concurrently so one slow cluster
			// doesn't block the entire WebSocket message loop.
			// Bounded by semaphore (#7277).
			sem <- struct{}{} // acquire slot
			go func(m protocol.Message) {
				defer func() { <-sem }() // release slot
				defer func() {
					if r := recover(); r != nil {
						slog.Error("[Kubectl] recovered from panic in message handler", "panic", r)
						// Notify the client about the panic so the UI can show an error
						if !closed.Load() {
							writeMu.Lock()
							conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
							_ = conn.WriteJSON(protocol.Message{
								ID:      m.ID,
								Type:    protocol.TypeError,
								Payload: protocol.ErrorPayload{Code: "panic", Message: "Internal server error during kubectl execution"},
							})
							conn.SetWriteDeadline(time.Time{})
							writeMu.Unlock()
						}
					}
				}()
				response := s.handleMessage(connCtx, m)
				if closed.Load() {
					return
				}
				writeMu.Lock()
				defer writeMu.Unlock()
				conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				if err := conn.WriteJSON(response); err != nil {
					slog.Error("write error", "error", err)
				}
				conn.SetWriteDeadline(time.Time{})
			}(msg)
		} else {
			// Dispatch all remaining message types to a goroutine so the
			// WebSocket read loop stays non-blocking (#9713). Previously this
			// branch ran synchronously; a provider that takes time to respond
			// blocked the read loop, preventing pings and cancel messages from
			// being processed until the call returned.
			// Goroutine count is bounded by the same semaphore as chat/kubectl.
			sem <- struct{}{} // acquire slot
			go func(m protocol.Message) {
				defer func() { <-sem }() // release slot
				defer func() {
					if r := recover(); r != nil {
						slog.Error("[WS] recovered from panic in async handler", "panic", r, "msgType", m.Type)
						if !closed.Load() {
							writeMu.Lock()
							conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
							_ = conn.WriteJSON(protocol.Message{
								ID:      m.ID,
								Type:    protocol.TypeError,
								Payload: protocol.ErrorPayload{Code: "panic", Message: "Internal server error"},
							})
							conn.SetWriteDeadline(time.Time{})
							writeMu.Unlock()
						}
					}
				}()
				response := s.handleMessage(connCtx, m)
				if closed.Load() {
					return
				}
				writeMu.Lock()
				conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				err := conn.WriteJSON(response)
				conn.SetWriteDeadline(time.Time{})
				writeMu.Unlock()
				if err != nil {
					slog.Error("write error", "error", err)
				}
			}(msg)
		}
	}
	closed.Store(true)
	close(stopPing) // signal pinger goroutine to exit

	// #9997 — Cancel all active chat sessions owned by this connection.
	// connCancel() (deferred above) cancels the parent context, but entries
	// remain in activeChatCtxs until the per-chat defer cleans them up. If
	// a chat goroutine is blocked waiting for the semaphore or a slow LLM
	// provider, the activeChatCtxs entry keeps a reference to the stale
	// cancel function. Explicitly cancelling and removing them here ensures
	// prompt cleanup on disconnect.
	s.cancelAllChatsForConn(conn)

	slog.Info("client disconnected", "addr", conn.RemoteAddr())
}

// handleMessage processes incoming messages (non-streaming).
// The ctx parameter is derived from the WebSocket connection's lifecycle context
// (connCtx) so that in-flight handlers are cancelled promptly when the client
// disconnects, preventing goroutine leaks (#9997).
func (s *Server) handleMessage(ctx context.Context, msg protocol.Message) protocol.Message {
	switch msg.Type {
	case protocol.TypeHealth:
		return s.handleHealthMessage(msg)
	case protocol.TypeClusters:
		return s.handleClustersMessage(msg)
	case protocol.TypeKubectl:
		return s.handleKubectlMessage(ctx, msg)
	// TypeChat and TypeClaude are handled by handleChatMessageStreaming in the WebSocket loop
	case protocol.TypeListAgents:
		return s.handleListAgentsMessage(msg)
	case protocol.TypeSelectAgent:
		return s.handleSelectAgentMessage(msg)
	default:
		return protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeError,
			Payload: protocol.ErrorPayload{
				Code:    "unknown_type",
				Message: fmt.Sprintf("Unknown message type: %s", msg.Type),
			},
		}
	}
}

func (s *Server) handleHealthMessage(msg protocol.Message) protocol.Message {
	clusters, _ := s.kubectl.ListContexts()
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.HealthPayload{
			Status:    "ok",
			Version:   Version,
			Clusters:  len(clusters),
			HasClaude: s.checkClaudeAvailable(),
			Claude:    s.getClaudeInfo(),
		},
	}
}

func (s *Server) handleClustersMessage(msg protocol.Message) protocol.Message {
	clusters, current := s.kubectl.ListContexts()
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ClustersPayload{
			Clusters: clusters,
			Current:  current,
		},
	}
}

// readOnlyKubectlVerbs are kubectl subcommands that do not modify cluster state.
// Used by the dry-run gate (#6442) to allow observation while blocking mutations.
var readOnlyKubectlVerbs = map[string]bool{
	"get":           true,
	"describe":      true,
	"logs":          true,
	"top":           true,
	"explain":       true,
	"api-resources": true,
	"api-versions":  true,
	"version":       true,
	"cluster-info":  true,
	"auth":          true, // can-i, whoami — read-only checks
}

// isReadOnlyKubectlCommand returns true when the kubectl args represent a
// read-only operation that is safe to execute even in dry-run mode.
func isReadOnlyKubectlCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}
	return readOnlyKubectlVerbs[strings.ToLower(args[0])]
}

// destructiveKubectlVerbs are kubectl subcommands that modify or destroy resources
// and require explicit user confirmation before execution.
var destructiveKubectlVerbs = map[string]bool{
	"delete":  true,
	"drain":   true,
	"cordon":  true,
	"taint":   true,
	"replace": true,
}

// isDestructiveKubectlCommand checks whether the given kubectl args contain a
// destructive verb that requires user confirmation before execution.
func isDestructiveKubectlCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}
	verb := strings.ToLower(args[0])
	if destructiveKubectlVerbs[verb] {
		return true
	}
	// "replace --force" is destructive even though plain "replace" is blocked
	if verb == "replace" {
		for _, a := range args[1:] {
			if a == "--force" {
				return true
			}
		}
	}
	return false
}

func (s *Server) handleKubectlMessage(ctx context.Context, msg protocol.Message) protocol.Message {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse kubectl request")
	}

	var req protocol.KubectlRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid kubectl request format")
	}

	// Server-enforced dry-run gate (#6442): if this kubectl request is
	// associated with a session in dry-run mode, reject any mutating command.
	// Read-only commands (get, describe, logs, etc.) remain allowed.
	if req.SessionID != "" {
		s.dryRunSessionsMu.RLock()
		isDryRun := s.dryRunSessions[req.SessionID]
		s.dryRunSessionsMu.RUnlock()
		if isDryRun && !isReadOnlyKubectlCommand(req.Args) {
			return protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeError,
				Payload: protocol.ErrorPayload{
					Code:    "dry_run_rejected",
					Message: fmt.Sprintf("dry-run mode: mutating command %q not allowed", strings.Join(req.Args, " ")),
				},
			}
		}
	}

	// Check for destructive commands that require confirmation
	if isDestructiveKubectlCommand(req.Args) && !req.Confirmed {
		return protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeResult,
			Payload: protocol.KubectlResponse{
				RequiresConfirmation: true,
				Command:              "kubectl " + strings.Join(req.Args, " "),
				ExitCode:             0,
			},
		}
	}

	// Execute kubectl — propagate the connection context so client disconnect
	// kills the kubectl process immediately (#9997).
	result := s.kubectl.ExecuteWithContext(ctx, req.Context, req.Namespace, req.Args)
	return protocol.Message{
		ID:      msg.ID,
		Type:    protocol.TypeResult,
		Payload: result,
	}
}

// handleChatMessageStreaming handles chat messages with streaming support.
// Runs in a goroutine so the WebSocket read loop stays free to receive cancel messages.
// writeMu/closed are shared with the read loop for safe concurrent WebSocket writes.
//
// #6688 — safeWrite no longer silently discards WriteJSON errors. A write
// error means the client socket is gone; continuing to call safeWrite just
// burns CPU encoding messages that can never be delivered. When we detect
// a write failure we log it, mark the connection closed, and early-out of
// future safeWrite calls. The caller's outer goroutine sees closed.Load()
// == true and will finish its work without further WebSocket traffic.
