package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
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
		origin := r.Header.Get("Origin")
		if s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol")
		w.WriteHeader(http.StatusOK)
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
				response := s.handleMessage(m)
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
								ID:   m.ID,
								Type: protocol.TypeError,
								Payload: protocol.ErrorPayload{Code: "panic", Message: "Internal server error"},
							})
							conn.SetWriteDeadline(time.Time{})
							writeMu.Unlock()
						}
					}
				}()
				response := s.handleMessage(m)
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

	slog.Info("client disconnected", "addr", conn.RemoteAddr())
}

// handleMessage processes incoming messages (non-streaming)
func (s *Server) handleMessage(msg protocol.Message) protocol.Message {
	switch msg.Type {
	case protocol.TypeHealth:
		return s.handleHealthMessage(msg)
	case protocol.TypeClusters:
		return s.handleClustersMessage(msg)
	case protocol.TypeKubectl:
		return s.handleKubectlMessage(msg)
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

func (s *Server) handleKubectlMessage(msg protocol.Message) protocol.Message {
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

	// Execute kubectl
	result := s.kubectl.Execute(req.Context, req.Namespace, req.Args)
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
func (s *Server) handleChatMessageStreaming(connCtx context.Context, conn *websocket.Conn, msg protocol.Message, forceAgent string, writeMu *sync.Mutex, closed *atomic.Bool) {
	safeWrite := func(ctx context.Context, outMsg protocol.Message) {
		if closed.Load() || ctx.Err() != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		// #7429 — Set a write deadline so a hung client (TCP zero-window) cannot
		// block this goroutine indefinitely, starving the pinger and leaking FDs.
		conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
		err := conn.WriteJSON(outMsg)
		conn.SetWriteDeadline(time.Time{}) // clear deadline
		if err != nil {
			slog.Error("[Chat] WebSocket write failed; marking connection closed",
				"msgID", outMsg.ID, "type", outMsg.Type, "error", err)
			closed.Store(true)
		}
	}

	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "invalid_payload", "Failed to parse chat request"))
		return
	}

	var req protocol.ChatRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		// Try legacy ClaudeRequest format for backward compatibility
		var legacyReq protocol.ClaudeRequest
		if err := json.Unmarshal(payloadBytes, &legacyReq); err != nil {
			safeWrite(context.Background(), s.errorResponse(msg.ID, "invalid_payload", "Invalid chat request format"))
			return
		}
		req.Prompt = legacyReq.Prompt
		req.SessionID = legacyReq.SessionID
	}

	if req.Prompt == "" {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty"))
		return
	}

	if len(req.Prompt) > maxPromptChars {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "prompt_too_large",
			fmt.Sprintf("Prompt exceeds maximum length of %d characters", maxPromptChars)))
		return
	}

	// SECURITY: Reject new prompts when the session token quota is exhausted
	// to prevent unbounded AI API spend (#9438).
	if s.isSessionQuotaExceeded() {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "token_quota_exceeded", s.sessionTokenQuotaMessage()))
		return
	}

	// Generate a unique session ID when the client omits one so that
	// concurrent anonymous chats do not collide in activeChatCtxs (#4263).
	if req.SessionID == "" {
		req.SessionID = uuid.New().String()
	}

	// Create a context with both cancel and timeout so that:
	//   1. cancel_chat messages can stop this session immediately,
	//   2. a hard deadline prevents missions from running forever when the
	//      AI provider hangs or never responds (#2375), and
	//   3. client disconnect (connCtx cancelled) stops in-progress
	//      StreamChat calls immediately, preventing goroutine/token leaks (#9709).
	ctx, cancel := context.WithTimeout(connCtx, missionExecutionTimeout)
	defer cancel()

	// Register cancel function so handleCancelChat can stop this session.
	// If a previous request is still running for this SessionID, cancel it
	// first to prevent orphaned goroutines (#9619).
	// The conn reference is stored alongside the cancel function so that
	// handleCancelChat can verify the requester owns the session (#9712).
	s.activeChatCtxsMu.Lock()
	if prev, exists := s.activeChatCtxs[req.SessionID]; exists {
		prev.cancel()
	}
	s.activeChatCtxs[req.SessionID] = activeChatEntry{cancel: cancel, conn: conn}
	s.activeChatCtxsMu.Unlock()
	defer func() {
		s.activeChatCtxsMu.Lock()
		delete(s.activeChatCtxs, req.SessionID)
		s.activeChatCtxsMu.Unlock()
	}()

	// Server-enforced dry-run gate (#6442): when the frontend sends
	// dryRun=true, register the session so the kubectl proxy rejects
	// mutating commands for this session regardless of what the AI decides.
	if req.DryRun {
		s.dryRunSessionsMu.Lock()
		s.dryRunSessions[req.SessionID] = true
		s.dryRunSessionsMu.Unlock()
		defer func() {
			s.dryRunSessionsMu.Lock()
			delete(s.dryRunSessions, req.SessionID)
			s.dryRunSessionsMu.Unlock()
		}()
		slog.Info("[Chat] dry-run mode enforced for session", "sessionID", req.SessionID)
	}

	// Determine which agent to use
	agentName := req.Agent
	if forceAgent != "" {
		agentName = forceAgent
	}
	if agentName == "" {
		agentName = s.registry.GetSelectedAgent(req.SessionID)
	}

	// Smart agent routing: if the prompt suggests command execution, prefer tool-capable agents
	// Also check conversation history for tool execution context
	needsTools := s.promptNeedsToolExecution(req.Prompt)
	slog.Info("[Chat] smart routing", "prompt", truncateString(req.Prompt, 50), "needsTools", needsTools, "currentAgent", agentName, "isToolCapable", s.isToolCapableAgent(agentName))

	if !needsTools && len(req.History) > 0 {
		// Check if any message in history suggests tool execution was requested
		for _, h := range req.History {
			if s.promptNeedsToolExecution(h.Content) {
				needsTools = true
				slog.Info("[Chat] history contains tool execution request", "content", truncateString(h.Content, 50))
				break
			}
		}
	}

	if needsTools && !s.isToolCapableAgent(agentName) {
		// Try mixed-mode: use thinking agent + CLI execution agent
		if toolAgent := s.findToolCapableAgent(); toolAgent != "" {
			slog.Info("[Chat] mixed-mode routing", "thinking", agentName, "execution", toolAgent)
			s.handleMixedModeChat(ctx, conn, msg, req, agentName, toolAgent, req.SessionID, writeMu, closed)
			return
		}
		slog.Info("[Chat] no tool-capable agent available, keeping current (best-effort)", "agent", agentName)
	}

	slog.Info("[Chat] final agent selection", "requested", req.Agent, "forceAgent", forceAgent, "selected", agentName, "sessionID", req.SessionID)

	// Get the provider
	provider, err := s.registry.Get(agentName)
	if err != nil {
		// Try default agent
		slog.Info("[Chat] agent not found, trying default", "agent", agentName)
		provider, err = s.registry.GetDefault()
		if err != nil {
			safeWrite(ctx, s.errorResponse(msg.ID, "no_agent", "No AI agent available. Please configure an API key"))
			return
		}
		agentName = provider.Name()
		slog.Info("[Chat] using default agent", "agent", agentName)
	}

	if !provider.IsAvailable() {
		safeWrite(ctx, s.errorResponse(msg.ID, "agent_unavailable", fmt.Sprintf("Agent %s is not available", agentName)))
		return
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, m := range req.History {
		history = append(history, ChatMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	chatReq := &ChatRequest{
		SessionID: req.SessionID,
		Prompt:    req.Prompt,
		History:   history,
	}

	// Thread cluster context so tool-capable agents scope kubectl to the
	// correct cluster, preventing multi-cluster context drift (#9485).
	if req.ClusterContext != "" {
		chatReq.Context = map[string]string{
			"clusterContext": req.ClusterContext,
		}
	}

	// Send initial progress message so user sees feedback immediately
	safeWrite(ctx, protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeProgress,
		Payload: protocol.ProgressPayload{
			Step: fmt.Sprintf("Processing with %s...", agentName),
		},
	})

	// Check if provider supports streaming with progress events
	var resp *ChatResponse
	if streamingProvider, ok := provider.(StreamingProvider); ok {
		// Use streaming with progress callbacks
		var streamedContent strings.Builder

		onChunk := func(chunk string) {
			streamedContent.WriteString(chunk)
			safeWrite(ctx, protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeStream,
				Payload: protocol.ChatStreamPayload{
					Content:   chunk,
					Agent:     agentName,
					SessionID: req.SessionID,
					Done:      false,
				},
			})
		}

		const maxCmdDisplayLen = 60
		onProgress := func(event StreamEvent) {
			// Build human-readable step description
			step := event.Tool
			if event.Type == "tool_use" {
				// For tool_use, show what tool is being called
				if cmd, ok := event.Input["command"].(string); ok {
					if len(cmd) > maxCmdDisplayLen {
						cmd = cmd[:maxCmdDisplayLen] + "..."
					}
					step = fmt.Sprintf("%s: %s", event.Tool, cmd)
				}
			} else if event.Type == "tool_result" {
				step = fmt.Sprintf("%s completed", event.Tool)
			}

			safeWrite(ctx, protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeProgress,
				Payload: protocol.ProgressPayload{
					Step:   step,
					Tool:   event.Tool,
					Input:  event.Input,
					Output: event.Output,
				},
			})
		}

		// Heartbeat goroutine: sends periodic progress events to prevent the
		// frontend's stream-inactivity timer from firing during long-running
		// tool calls (e.g., `drasi init` which deploys Kubernetes components
		// and can take several minutes with no output).
		// Use a buffered channel so close() never races with a pending
		// send, preventing "send on closed channel" panics (#7179).
		heartbeatDone := make(chan struct{}, 1)
		var heartbeatOnce sync.Once
		go func() {
			ticker := time.NewTicker(missionHeartbeatInterval)
			defer ticker.Stop()
			for {
				select {
				case <-heartbeatDone:
					return
				case <-ctx.Done():
					return
				case <-ticker.C:
					safeWrite(ctx, protocol.Message{
						ID:   msg.ID,
						Type: protocol.TypeProgress,
						Payload: protocol.ProgressPayload{
							Step: "Still working...",
						},
					})
				}
			}
		}()
		// Defer close so the heartbeat goroutine is always stopped,
		// even if StreamChatWithProgress panics (#7001).
		// sync.Once ensures close is called exactly once (#7179).
		defer heartbeatOnce.Do(func() { close(heartbeatDone) })

		resp, err = streamingProvider.StreamChatWithProgress(ctx, chatReq, onChunk, onProgress)
		if err != nil {
			if ctx.Err() != nil {
				// Distinguish timeout from user-initiated cancel (#2375)
				if ctx.Err() == context.DeadlineExceeded {
					slog.Info("[Chat] session timed out", "sessionID", req.SessionID, "timeout", missionExecutionTimeout)
					safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
						fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
					return
				}
				slog.Info("[Chat] session cancelled", "sessionID", req.SessionID)
				return
			}
			slog.Error("[Chat] streaming execution error", "agent", agentName, "error", err)
			code, msg2 := classifyProviderError(err)
			// Use background context so the error reaches the client even if
			// the mission context expired between the ctx.Err() check above
			// and this write (#6997).
			safeWrite(context.Background(), s.errorResponse(msg.ID, code, msg2))
			return
		}

		// Use streamed content if result content is empty
		if resp.Content == "" {
			resp.Content = streamedContent.String()
		}
	} else {
		// Fall back to non-streaming for providers that don't support progress
		resp, err = provider.Chat(ctx, chatReq)
		if err != nil {
			if ctx.Err() != nil {
				// Distinguish timeout from user-initiated cancel (#2375)
				if ctx.Err() == context.DeadlineExceeded {
					slog.Info("[Chat] session timed out", "sessionID", req.SessionID, "timeout", missionExecutionTimeout)
					safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
						fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
					return
				}
				slog.Info("[Chat] session cancelled", "sessionID", req.SessionID)
				return
			}
			slog.Error("[Chat] execution error", "agent", agentName, "error", err)
			code, msg2 := classifyProviderError(err)
			// Use background context so the error reaches the client even if
			// the mission context expired (#6997).
			safeWrite(context.Background(), s.errorResponse(msg.ID, code, msg2))
			return
		}
	}

	// Don't send result if cancelled
	if ctx.Err() != nil {
		if ctx.Err() == context.DeadlineExceeded {
			slog.Info("[Chat] session timed out after completion", "sessionID", req.SessionID)
			safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
				fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
			return
		}
		slog.Info("[Chat] session cancelled after completion", "sessionID", req.SessionID)
		return
	}

	// Ensure we have a valid response object to avoid nil panics
	if resp == nil {
		resp = &ChatResponse{
			Content:    "",
			Agent:      agentName,
			TokenUsage: &ProviderTokenUsage{},
		}
	}

	// Track token usage
	if resp.TokenUsage != nil {
		s.addTokenUsage(resp.TokenUsage)
	}

	var inputTokens, outputTokens, totalTokens int
	if resp.TokenUsage != nil {
		inputTokens = resp.TokenUsage.InputTokens
		outputTokens = resp.TokenUsage.OutputTokens
		totalTokens = resp.TokenUsage.TotalTokens
	}

	// Send final result. Use context.Background() rather than the mission ctx
	// because the mission's deadline can fire in the narrow window between the
	// ctx.Err() check above and this write, silently dropping the final
	// TypeResult message and leaving the client's chat bubble stuck in a
	// "thinking" state (#7925). The error paths above already use
	// context.Background() for the same reason — this matches that pattern.
	safeWrite(context.Background(), protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ChatStreamPayload{
			Content:   resp.Content,
			Agent:     resp.Agent,
			SessionID: req.SessionID,
			Done:      true,
			Usage: &protocol.ChatTokenUsage{
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
			},
		},
	})
}

// handleCancelChat cancels an in-progress chat session by calling its context cancel function
func (s *Server) handleCancelChat(conn *websocket.Conn, msg protocol.Message, writeMu *sync.Mutex) {
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		slog.Error("[Chat] failed to marshal cancel chat payload", "error", err)
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		slog.Error("[Chat] failed to unmarshal cancel chat request", "error", err)
		return
	}

	// #7432 — Extract cancelFn and delete entry under the lock, but call
	// cancelFn() AFTER releasing the mutex. Context cancellation can
	// propagate across goroutine boundaries; if the provider's cleanup
	// path attempts to re-lock activeChatCtxsMu, calling cancelFn inside
	// the lock causes a deadlock.
	//
	// SECURITY (#9712): Only allow cancellation when the requesting connection
	// (conn) matches the connection that originally registered the session.
	// This prevents cross-session CSRF/bypass where User B cancels User A's
	// mission by sending a cancel_chat message with a known sessionId.
	s.activeChatCtxsMu.Lock()
	entry, ok := s.activeChatCtxs[req.SessionID]
	if ok {
		if entry.conn != conn {
			// Session exists but belongs to a different connection — reject.
			s.activeChatCtxsMu.Unlock()
			slog.Warn("[Chat] SECURITY: rejected cancel from non-owning connection",
				"sessionID", req.SessionID, "requester", conn.RemoteAddr())
			writeMu.Lock()
			conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			_ = conn.WriteJSON(protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeError,
				Payload: protocol.ErrorPayload{
					Code:    "unauthorized_cancel",
					Message: "You do not own this session",
				},
			})
			conn.SetWriteDeadline(time.Time{})
			writeMu.Unlock()
			return
		}
		delete(s.activeChatCtxs, req.SessionID)
	}
	s.activeChatCtxsMu.Unlock()

	if ok {
		entry.cancel()
		slog.Info("[Chat] cancelled chat", "sessionID", req.SessionID)
	} else {
		slog.Info("[Chat] no active chat to cancel", "sessionID", req.SessionID)
	}

	writeMu.Lock()
	// #6690 — Previously this WriteJSON error was discarded; now log it
	// structurally so an operator can see when a cancel acknowledgement
	// fails to reach the client (typically because the connection died
	// concurrently with the cancel request).
	// #7429 — Write deadline prevents blocking on hung clients.
	conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	if err := conn.WriteJSON(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: map[string]interface{}{
			"cancelled": ok,
			"sessionId": req.SessionID,
		},
	}); err != nil {
		slog.Error("[Chat] failed to write cancel ack to WebSocket",
			"sessionID", req.SessionID, "cancelled", ok, "error", err)
	}
	conn.SetWriteDeadline(time.Time{}) // clear deadline
	writeMu.Unlock()
}

// handleCancelChatHTTP is the HTTP fallback for cancelling in-progress chat sessions.
// Used when the WebSocket connection is unavailable (e.g., disconnected during long agent runs).
func (s *Server) handleCancelChatHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" {
		http.Error(w, `{"error":"sessionId is required"}`, http.StatusBadRequest)
		return
	}

	// #7432 — Same deadlock fix as handleCancelChat: extract cancelFn under
	// the lock but invoke it after releasing the mutex.
	// The HTTP path is already guarded by validateToken, so no additional
	// ownership check is needed here (#9712).
	s.activeChatCtxsMu.Lock()
	entry, ok := s.activeChatCtxs[req.SessionID]
	if ok {
		delete(s.activeChatCtxs, req.SessionID)
	}
	s.activeChatCtxsMu.Unlock()

	if ok {
		entry.cancel()
		slog.Info("[Chat] cancelled chat via HTTP", "sessionID", req.SessionID)
	} else {
		slog.Info("[Chat] no active chat to cancel via HTTP", "sessionID", req.SessionID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cancelled": ok,
		"sessionId": req.SessionID,
	})
}

// handleChatMessage handles chat messages (both legacy claude and new chat types)
// This is the non-streaming version, kept for API compatibility
func (s *Server) handleChatMessage(msg protocol.Message, forceAgent string) protocol.Message {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse chat request")
	}

	var req protocol.ChatRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		// Try legacy ClaudeRequest format for backward compatibility
		var legacyReq protocol.ClaudeRequest
		if err := json.Unmarshal(payloadBytes, &legacyReq); err != nil {
			return s.errorResponse(msg.ID, "invalid_payload", "Invalid chat request format")
		}
		req.Prompt = legacyReq.Prompt
		req.SessionID = legacyReq.SessionID
	}

	if req.Prompt == "" {
		return s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty")
	}

	// SECURITY: Reject new prompts when the session token quota is exhausted
	// to prevent unbounded AI API spend (#9438).
	if s.isSessionQuotaExceeded() {
		return s.errorResponse(msg.ID, "token_quota_exceeded", s.sessionTokenQuotaMessage())
	}

	// Generate a unique session ID when the client omits one so that
	// concurrent anonymous chats do not collide (#4263).
	if req.SessionID == "" {
		req.SessionID = uuid.New().String()
	}

	// Determine which agent to use
	agentName := req.Agent
	if forceAgent != "" {
		agentName = forceAgent
	}
	if agentName == "" {
		agentName = s.registry.GetSelectedAgent(req.SessionID)
	}

	// Get the provider
	provider, err := s.registry.Get(agentName)
	if err != nil {
		// Try default agent
		provider, err = s.registry.GetDefault()
		if err != nil {
			return s.errorResponse(msg.ID, "no_agent", "No AI agent available. Please configure an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)")
		}
		agentName = provider.Name()
	}

	if !provider.IsAvailable() {
		return s.errorResponse(msg.ID, "agent_unavailable", fmt.Sprintf("Agent %s is not available - API key may be missing", agentName))
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, msg := range req.History {
		history = append(history, ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Execute chat (non-streaming for WebSocket single response)
	chatReq := &ChatRequest{
		SessionID: req.SessionID,
		Prompt:    req.Prompt,
		History:   history,
	}

	// Thread cluster context for non-streaming path (#9485).
	if req.ClusterContext != "" {
		chatReq.Context = map[string]string{
			"clusterContext": req.ClusterContext,
		}
	}

	// #6678 — Previously this used context.Background() with no deadline,
	// which meant a hung AI provider would block the WebSocket goroutine
	// forever (the caller was a synchronous path from the read loop).
	// Wrap with a 30s default timeout so a misbehaving provider cannot
	// permanently wedge the WS reader goroutine. 30s matches the default
	// used by InsightEnrichmentTimeout for similar short-form AI calls.
	ctx, cancel := context.WithTimeout(context.Background(), handleChatMessageTimeout)
	defer cancel()
	resp, err := provider.Chat(ctx, chatReq)
	if err != nil {
		slog.Error("[Chat] execution error", "agent", agentName, "error", err, "timeout", handleChatMessageTimeout)
		if ctx.Err() == context.DeadlineExceeded {
			return s.errorResponse(msg.ID, "timeout",
				fmt.Sprintf("%s did not respond within %s", agentName, handleChatMessageTimeout))
		}
		return s.errorResponse(msg.ID, "execution_error", fmt.Sprintf("Failed to execute %s", agentName))
	}

	if resp == nil {
		resp = &ChatResponse{
			Content:    "",
			Agent:      agentName,
			TokenUsage: &ProviderTokenUsage{},
		}
	}

	// Track token usage
	if resp.TokenUsage != nil {
		s.addTokenUsage(resp.TokenUsage)
	}

	var inputTokens, outputTokens, totalTokens int
	if resp.TokenUsage != nil {
		inputTokens = resp.TokenUsage.InputTokens
		outputTokens = resp.TokenUsage.OutputTokens
		totalTokens = resp.TokenUsage.TotalTokens
	}

	// Return response in format compatible with both legacy and new clients
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ChatStreamPayload{
			Content:   resp.Content,
			Agent:     resp.Agent,
			SessionID: req.SessionID,
			Done:      true,
			Usage: &protocol.ChatTokenUsage{
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
			},
		},
	}
}

// handleListAgentsMessage returns the list of available AI agents
func (s *Server) handleListAgentsMessage(msg protocol.Message) protocol.Message {
	providers := s.registry.List()
	agents := make([]protocol.AgentInfo, len(providers))

	for i, p := range providers {
		agents[i] = protocol.AgentInfo{
			Name:         p.Name,
			DisplayName:  p.DisplayName,
			Description:  p.Description,
			Provider:     p.Provider,
			Available:    p.Available,
			Capabilities: int(p.Capabilities),
		}
	}

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeAgentsList,
		Payload: protocol.AgentsListPayload{
			Agents:       agents,
			DefaultAgent: s.registry.GetDefaultName(),
			Selected:     s.registry.GetDefaultName(), // Use default for new connections
		},
	}
}

// handleSelectAgentMessage handles agent selection for a session
func (s *Server) handleSelectAgentMessage(msg protocol.Message) protocol.Message {
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse select agent request")
	}

	var req protocol.SelectAgentRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid select agent request format")
	}

	if req.Agent == "" {
		return s.errorResponse(msg.ID, "empty_agent", "Agent name cannot be empty")
	}

	// For session-based selection, we'd need a session ID from the request
	// For now, update the default agent
	previousAgent := s.registry.GetDefaultName()
	if err := s.registry.SetDefault(req.Agent); err != nil {
		slog.Error("set default agent error", "error", err)
		return s.errorResponse(msg.ID, "invalid_agent", "invalid agent selection")
	}

	slog.Info("agent selected", "agent", req.Agent, "previous", previousAgent)

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeAgentSelected,
		Payload: protocol.AgentSelectedPayload{
			Agent:    req.Agent,
			Previous: previousAgent,
		},
	}
}

func (s *Server) errorResponse(id, code, message string) protocol.Message {
	return protocol.Message{
		ID:   id,
		Type: protocol.TypeError,
		Payload: protocol.ErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

// classifyProviderError inspects an AI provider error and returns a
// specific error code + user-friendly message.  This lets the frontend
// show targeted guidance (e.g. "run /login") instead of a raw JSON blob.
func classifyProviderError(err error) (code, message string) {
	errText := strings.ToLower(err.Error())

	// Authentication / token expiry (HTTP 401 / 403)
	if strings.Contains(errText, "status 401") ||
		strings.Contains(errText, "status 403") ||
		strings.Contains(errText, "authentication_error") ||
		strings.Contains(errText, "permission_error") ||
		strings.Contains(errText, "oauth token") ||
		strings.Contains(errText, "token has expired") ||
		strings.Contains(errText, "invalid x-api-key") ||
		strings.Contains(errText, "invalid_api_key") ||
		strings.Contains(errText, "unauthorized") {
		return "authentication_error", "Failed to authenticate. API Error: " + err.Error()
	}

	// Rate limit (HTTP 429)
	if strings.Contains(errText, "status 429") ||
		strings.Contains(errText, "rate_limit") ||
		strings.Contains(errText, "rate limit") ||
		strings.Contains(errText, "too many requests") ||
		strings.Contains(errText, "resource_exhausted") {
		return "rate_limit", "Rate limit exceeded. " + err.Error()
	}

	return "execution_error", "Failed to get response from AI provider. " + err.Error()
}

// handleMixedModeChat orchestrates a dual-agent chat:
// 1. Thinking agent (API) analyzes the prompt and generates a plan
// 2. Execution agent (CLI) runs any commands
// 3. Thinking agent analyzes the results
func (s *Server) handleMixedModeChat(ctx context.Context, conn *websocket.Conn, msg protocol.Message, req protocol.ChatRequest, thinkingAgent, executionAgent string, sessionID string, writeMu *sync.Mutex, closed *atomic.Bool) {
	// safeWrite mirrors handleChatMessageStreaming.safeWrite (#6688):
	// WriteJSON errors mark the connection closed so subsequent writes
	// short-circuit instead of silently failing.
	safeWrite := func(outMsg protocol.Message) {
		if closed.Load() || ctx.Err() != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		// #7429 — Set a write deadline so a hung client cannot block indefinitely.
		conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
		err := conn.WriteJSON(outMsg)
		conn.SetWriteDeadline(time.Time{}) // clear deadline
		if err != nil {
			slog.Error("[Chat/MixedMode] WebSocket write failed; marking connection closed",
				"msgID", outMsg.ID, "type", outMsg.Type, "error", err)
			closed.Store(true)
		}
	}

	thinkingProvider, err := s.registry.Get(thinkingAgent)
	if err != nil {
		safeWrite(s.errorResponse(msg.ID, "agent_error", fmt.Sprintf("Thinking agent %s not found", thinkingAgent)))
		return
	}
	execProvider, err := s.registry.Get(executionAgent)
	if err != nil {
		safeWrite(s.errorResponse(msg.ID, "agent_error", fmt.Sprintf("Execution agent %s not found", executionAgent)))
		return
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, m := range req.History {
		history = append(history, ChatMessage{Role: m.Role, Content: m.Content})
	}

	// Phase 1: Send thinking phase indicator
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeThinking,
		Payload: map[string]interface{}{
			"agent":   thinkingProvider.DisplayName(),
			"phase":   "thinking",
			"message": fmt.Sprintf("🧠 %s is analyzing your request...", thinkingProvider.DisplayName()),
		},
	})

	// Ask thinking agent to analyze and generate commands
	thinkingPrompt := fmt.Sprintf(`You are helping with a Kubernetes/infrastructure task. Analyze the following request and respond with:
1. A brief analysis of what needs to be done
2. The exact commands that need to be executed (one per line, prefixed with "CMD: ")
3. What to look for in the output

User request: %s`, req.Prompt)

	// Thread cluster context to both thinking and execution agents so
	// kubectl commands are scoped to the user's current cluster (#9485).
	var chatCtx map[string]string
	if req.ClusterContext != "" {
		chatCtx = map[string]string{
			"clusterContext": req.ClusterContext,
		}
	}

	thinkingReq := ChatRequest{
		Prompt:    thinkingPrompt,
		SessionID: sessionID,
		History:   history,
		Context:   chatCtx,
	}

	// #9618 — Check if WebSocket is still alive before expensive provider call.
	// Without this, orphaned goroutines continue running AI requests for up to
	// 5 minutes after the client disconnects.
	if closed.Load() {
		slog.Info("[MixedMode] connection closed before thinking call", "sessionID", sessionID)
		return
	}

	thinkingResp, err := thinkingProvider.Chat(ctx, &thinkingReq)
	if err != nil {
		if ctx.Err() != nil {
			slog.Info("[MixedMode] session cancelled", "sessionID", sessionID)
			return
		}
		slog.Error("[MixedMode] thinking agent error", "error", err)
		safeWrite(s.errorResponse(msg.ID, "mixed_mode_error", fmt.Sprintf("Thinking agent error: %v", err)))
		return
	}
	if thinkingResp == nil {
		slog.Info("[MixedMode] Thinking agent returned nil response")
		safeWrite(s.errorResponse(msg.ID, "mixed_mode_error", "Thinking agent returned empty response"))
		return
	}

	// Stream the thinking response
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeStreamChunk,
		Payload: map[string]interface{}{
			"content": fmt.Sprintf("**🧠 %s Analysis:**\n%s\n\n", thinkingProvider.DisplayName(), thinkingResp.Content),
			"agent":   thinkingAgent,
			"phase":   "thinking",
		},
	})

	// Extract commands from thinking response using robust heuristics (#9440).
	commands := extractCommandsFromResponse(thinkingResp.Content)

	if len(commands) == 0 {
		// No commands to execute - just return thinking response
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamEnd,
			Payload: map[string]interface{}{
				"agent": thinkingAgent,
				"phase": "complete",
			},
		})
		return
	}

	// Phase 2: Execute commands via CLI agent
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeExecuting,
		Payload: map[string]interface{}{
			"agent":    execProvider.DisplayName(),
			"phase":    "executing",
			"message":  fmt.Sprintf("🔧 %s is executing %d command(s)...", execProvider.DisplayName(), len(commands)),
			"commands": commands,
		},
	})

	// Build execution prompt for CLI agent
	execPrompt := fmt.Sprintf("Execute the following commands and return the output:\n%s",
		strings.Join(commands, "\n"))

	execReq := ChatRequest{
		Prompt:    execPrompt,
		SessionID: sessionID,
		Context:   chatCtx,
	}

	var execContent string

	if closed.Load() {
		slog.Info("[MixedMode] connection closed before execution call", "sessionID", sessionID)
		return
	}

	execResp, err := execProvider.Chat(ctx, &execReq)
	if err != nil {
		if ctx.Err() != nil {
			slog.Info("[MixedMode] session cancelled during execution", "sessionID", sessionID)
			return
		}
		slog.Error("[MixedMode] execution agent error", "error", err)
		execContent = fmt.Sprintf("Execution Error: %v", err)
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("\n**🔧 %s Execution Error:** %v\n", execProvider.DisplayName(), err),
				"agent":   executionAgent,
				"phase":   "executing",
			},
		})
	} else {
		if execResp != nil {
			execContent = execResp.Content
		}
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("**🔧 %s Output:**\n```\n%s\n```\n\n", execProvider.DisplayName(), execContent),
				"agent":   executionAgent,
				"phase":   "executing",
			},
		})
	}

	// Phase 3: Feed results back to thinking agent for analysis
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeThinking,
		Payload: map[string]interface{}{
			"agent":   thinkingProvider.DisplayName(),
			"phase":   "analyzing",
			"message": fmt.Sprintf("🧠 %s is analyzing the results...", thinkingProvider.DisplayName()),
		},
	})

	analysisPrompt := fmt.Sprintf(`Based on the original request and the command output below, provide a clear summary and any recommended next steps.

Original request: %s

Command output:
%s`, req.Prompt, execContent)

	analysisReq := ChatRequest{
		Prompt:    analysisPrompt,
		SessionID: sessionID,
		History:   append(history, ChatMessage{Role: "assistant", Content: thinkingResp.Content}),
	}

	if closed.Load() {
		slog.Info("[MixedMode] connection closed before analysis call", "sessionID", sessionID)
		return
	}

	analysisResp, err := thinkingProvider.Chat(ctx, &analysisReq)
	if err != nil {
		if ctx.Err() != nil {
			slog.Info("[MixedMode] session cancelled during analysis", "sessionID", sessionID)
			return
		}
		slog.Error("[MixedMode] analysis error", "error", err)
	} else if analysisResp != nil {
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("**🧠 %s Summary:**\n%s", thinkingProvider.DisplayName(), analysisResp.Content),
				"agent":   thinkingAgent,
				"phase":   "analyzing",
			},
		})
	}

	// End stream
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeStreamEnd,
		Payload: map[string]interface{}{
			"agent": thinkingAgent,
			"phase": "complete",
			"mode":  "mixed",
		},
	})

	// Send TypeResult with Done:true so the UI clears the "Thinking..."
	// spinner and unlocks the input, matching the regular streaming path (#6999).
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ChatStreamPayload{
			SessionID: sessionID,
			Done:      true,
		},
	})
}

// promptNeedsToolExecution checks if the prompt or history suggests command execution.
//
// This is a cheap heuristic used to decide whether to route a chat message to a
// tool-capable agent (claude-code, codex, gemini-cli) or a plain conversational
// agent. A previous implementation relied on `strings.Contains` of a flat
// keyword list, which misrouted declarative/interrogative prompts like
// "How do I delete a namespace?" (contains "delete") and "yes, that is correct"
// (retry-keyword "yes" matched via Contains). See #8074.
func (s *Server) promptNeedsToolExecution(prompt string) bool {
	prompt = strings.ToLower(prompt)
	trimmed := strings.TrimSpace(prompt)

	// Declarative/interrogative prefixes that indicate an explanatory question,
	// not a tool-execution request. Return false regardless of later keywords
	// so "How do I delete a namespace?" is not routed to a tool-capable agent
	// just because it contains the word "delete". (#8074)
	questionPrefixes := []string{
		"how do", "how can", "how should", "how to",
		"what is", "what are", "what does", "what's the",
		"why ", "when ", "where ", "which ",
		"explain ", "tell me ", "describe how", "describe what",
		"can you explain", "could you explain",
	}
	for _, prefix := range questionPrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			return false
		}
	}

	// Keywords that suggest command execution is needed
	executionKeywords := []string{
		"run ", "execute", "kubectl", "helm", "check ", "show me", "get ",
		"list ", "describe", "analyze", "investigate", "fix ", "repair",
		"uncordon", "cordon", "drain", "scale", "restart", "delete",
		"apply", "create", "patch", "rollout", "logs", "status",
		"deploy", "install", "upgrade", "rollback",
	}
	for _, keyword := range executionKeywords {
		if strings.Contains(prompt, keyword) {
			return true
		}
	}

	// Retry/continuation requests that imply tool execution. These must match
	// as whole tokens rather than substrings so "yes" does not match
	// "yesterday" and "do it" does not match "do itemize". We check exact-match
	// on the trimmed prompt plus a space-bounded Contains check for phrases
	// embedded in longer sentences ("try again please"). (#8074)
	retryKeywords := []string{
		"try again", "retry", "do it", "run it", "execute it",
		"yes", "proceed", "go ahead", "please do",
	}
	paddedPrompt := " " + trimmed + " "
	for _, keyword := range retryKeywords {
		if trimmed == keyword {
			return true
		}
		if strings.Contains(paddedPrompt, " "+keyword+" ") {
			return true
		}
		if strings.Contains(paddedPrompt, " "+keyword+",") {
			return true
		}
		if strings.Contains(paddedPrompt, " "+keyword+".") {
			return true
		}
	}
	return false
}

// isToolCapableAgent checks if an agent has tool execution capabilities
func (s *Server) isToolCapableAgent(agentName string) bool {
	provider, err := s.registry.Get(agentName)
	if err != nil {
		return false
	}
	return provider.Capabilities().HasCapability(CapabilityToolExec)
}

// findToolCapableAgent finds the best available agent with tool execution capabilities.
// Agents that can execute commands directly (claude-code, codex, gemini-cli) are
// preferred over agents that only suggest commands (copilot-cli). This prevents
// missions from returning kubectl suggestions instead of executing them (#3609).
func (s *Server) findToolCapableAgent() string {
	// Priority order: agents that execute commands directly first,
	// then agents that may only suggest commands.
	preferredOrder := []string{"claude-code", "codex", "gemini-cli", "antigravity", "bob"}
	suggestOnlyAgents := []string{"copilot-cli"}

	allProviders := s.registry.List()

	// First pass: try preferred agents in priority order
	for _, name := range preferredOrder {
		for _, info := range allProviders {
			if info.Name == name && info.Available && ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) {
				return info.Name
			}
		}
	}

	// Second pass: any tool-capable agent that is NOT in the suggest-only list
	suggestOnly := make(map[string]bool, len(suggestOnlyAgents))
	for _, name := range suggestOnlyAgents {
		suggestOnly[name] = true
	}
	for _, info := range allProviders {
		if ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) && info.Available && !suggestOnly[info.Name] {
			return info.Name
		}
	}

	// Last resort: even suggest-only agents are better than nothing
	for _, info := range allProviders {
		if ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) && info.Available {
			return info.Name
		}
	}

	return ""
}

func (s *Server) checkClaudeAvailable() bool {
	// Check if any AI provider is available
	return s.registry.HasAvailableProviders()
}

// getClaudeInfo returns AI provider info (for backward compatibility)
func (s *Server) getClaudeInfo() *protocol.ClaudeInfo {
	if !s.registry.HasAvailableProviders() {
		return nil
	}

	// Return info about available providers
	available := s.registry.ListAvailable()
	var providerNames []string
	for _, p := range available {
		providerNames = append(providerNames, p.DisplayName)
	}

	// Get current token usage
	s.tokenMux.RLock()
	sessionIn := s.sessionTokensIn
	sessionOut := s.sessionTokensOut
	todayIn := s.todayTokensIn
	todayOut := s.todayTokensOut
	s.tokenMux.RUnlock()

	return &protocol.ClaudeInfo{
		Installed: true,
		Version:   fmt.Sprintf("Multi-agent: %s", strings.Join(providerNames, ", ")),
		TokenUsage: protocol.TokenUsage{
			Session: protocol.TokenCount{
				Input:  sessionIn,
				Output: sessionOut,
			},
			Today: protocol.TokenCount{
				Input:  todayIn,
				Output: todayOut,
			},
		},
	}
}

// isSessionQuotaExceeded returns true when the aggregate session token count
// (input + output) has reached or passed the configured quota. A quota of 0
// means unlimited — the check is skipped (#9438).
func (s *Server) isSessionQuotaExceeded() bool {
	if s.sessionTokenQuota <= 0 {
		return false // unlimited
	}
	s.tokenMux.Lock()
	total := s.sessionTokensIn + s.sessionTokensOut
	s.tokenMux.Unlock()
	return total >= s.sessionTokenQuota
}

// sessionTokenQuotaMessage builds a human-readable error string returned to
// the client when the session token quota is exceeded.
func (s *Server) sessionTokenQuotaMessage() string {
	return fmt.Sprintf(
		"Session token quota exceeded (limit: %d tokens). "+
			"Restart kc-agent to reset the session quota, or increase "+
			"the limit via the %s environment variable.",
		s.sessionTokenQuota, sessionTokenQuotaEnvVar)
}

// tokenUsageFlushInterval is how often accumulated in-memory token usage
// is flushed to disk. Batching prevents high-frequency disk I/O when many
// AI responses arrive in quick succession (#9483).
const tokenUsageFlushInterval = 5 * time.Second

// addTokenUsage accumulates token usage from a chat response.
// Instead of writing to disk on every call, it schedules a debounced
// flush that fires after tokenUsageFlushInterval of inactivity (#9483).
func (s *Server) addTokenUsage(usage *ProviderTokenUsage) {
	if usage == nil {
		return
	}

	s.tokenMux.Lock()

	// Check if day changed - reset daily counters
	today := time.Now().Format("2006-01-02")
	if today != s.todayDate {
		s.todayDate = today
		s.todayTokensIn = 0
		s.todayTokensOut = 0
	}

	// Accumulate tokens
	s.sessionTokensIn += int64(usage.InputTokens)
	s.sessionTokensOut += int64(usage.OutputTokens)
	s.todayTokensIn += int64(usage.InputTokens)
	s.todayTokensOut += int64(usage.OutputTokens)

	// Schedule a non-resetting flush: if no timer is pending, start one.
	// Unlike the previous debounce that reset on every call (#9616), this
	// guarantees the flush fires within tokenUsageFlushInterval of the FIRST
	// token update, preventing unbounded data loss if tokens arrive faster
	// than the interval.
	if s.tokenFlushTimer == nil {
		s.tokenFlushTimer = time.AfterFunc(tokenUsageFlushInterval, func() {
			s.tokenMux.Lock()
			s.tokenFlushTimer = nil
			s.tokenMux.Unlock()
			s.saveTokenUsage()
		})
	}

	s.tokenMux.Unlock()
}

// tokenUsageData is persisted to disk
type tokenUsageData struct {
	Date      string `json:"date"`
	InputIn   int64  `json:"inputIn"`
	OutputOut int64  `json:"outputOut"`
}

// getTokenUsagePath returns the path to the token usage file
func getTokenUsagePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp/kc-agent-tokens.json"
	}
	return home + "/.kc-agent-tokens.json"
}

// tokenUsageLockSuffix is appended to the token usage file path to form
// the advisory lock file path used by flock (#9730).
const tokenUsageLockSuffix = ".lock"

// loadTokenUsage loads token usage from disk on startup.
// An advisory file lock (flock) is held during the read to prevent
// observing a partially-written file from a concurrent instance (#9730).
func (s *Server) loadTokenUsage() {
	path := getTokenUsagePath()
	lockPath := path + tokenUsageLockSuffix

	release, err := acquireFileLock(lockPath)
	if err != nil {
		slog.Warn("could not acquire file lock for token load", "error", err)
		// Fall through to best-effort unlocked read so a single-instance
		// deployment is not broken by a lock failure.
	}
	if release != nil {
		defer release()
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return // File doesn't exist yet
	}

	var usage tokenUsageData
	if err := json.Unmarshal(data, &usage); err != nil {
		slog.Warn("could not parse token usage file", "error", err)
		return
	}

	s.tokenMux.Lock()
	defer s.tokenMux.Unlock()

	// Only load if same day
	today := time.Now().Format("2006-01-02")
	if usage.Date == today {
		s.todayTokensIn = usage.InputIn
		s.todayTokensOut = usage.OutputOut
		s.todayDate = today
		// Seed lastSaved so the first saveTokenUsage computes the correct
		// delta relative to what was already on disk (#9730).
		s.lastSavedIn = usage.InputIn
		s.lastSavedOut = usage.OutputOut
		slog.Info("loaded token usage", "inputTokens", usage.InputIn, "outputTokens", usage.OutputOut)
	}
}

// saveTokenUsage persists token usage to disk.
//
// To prevent multi-instance data corruption (#9730), this function:
//  1. Acquires an inter-process advisory file lock (flock / LockFileEx).
//  2. Reads the current on-disk state (which may include writes from other
//     instances since our last save).
//  3. Computes the delta this instance has accumulated since its last save.
//  4. Merges the delta into the on-disk totals.
//  5. Writes the merged result back and releases the lock.
//
// tokenFileMux continues to serialize concurrent goroutines within this
// process (#9441); flock serializes across OS processes.
func (s *Server) saveTokenUsage() {
	s.tokenFileMux.Lock()
	defer s.tokenFileMux.Unlock()

	path := getTokenUsagePath()
	lockPath := path + tokenUsageLockSuffix

	// Acquire inter-process lock (#9730).
	release, lockErr := acquireFileLock(lockPath)
	if lockErr != nil {
		slog.Warn("could not acquire file lock for token save", "error", lockErr)
		// Fall through to best-effort unlocked write for single-instance
		// deployments where flock is unavailable (e.g. NFS without lock
		// daemon). The in-process tokenFileMux still prevents goroutine races.
	}
	if release != nil {
		defer release()
	}

	// Snapshot current in-memory counters.
	s.tokenMux.Lock()
	currentDate := s.todayDate
	currentIn := s.todayTokensIn
	currentOut := s.todayTokensOut
	prevSavedIn := s.lastSavedIn
	prevSavedOut := s.lastSavedOut
	s.tokenMux.Unlock()

	// Compute the delta this instance accumulated since its last save.
	deltaIn := currentIn - prevSavedIn
	deltaOut := currentOut - prevSavedOut

	// Read on-disk state (may contain writes from other instances).
	var onDisk tokenUsageData
	if diskData, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(diskData, &onDisk)
	}

	// Merge: if the on-disk date matches, add our delta to the on-disk
	// totals. Otherwise start fresh for the new day.
	merged := tokenUsageData{Date: currentDate}
	if onDisk.Date == currentDate {
		merged.InputIn = onDisk.InputIn + deltaIn
		merged.OutputOut = onDisk.OutputOut + deltaOut
	} else {
		merged.InputIn = deltaIn
		merged.OutputOut = deltaOut
	}

	data, err := json.Marshal(merged)
	if err != nil {
		return
	}

	// Atomic write: write to a temp file then rename to avoid corruption
	// if the process is killed mid-write (#6996).
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, agentFileMode); err != nil {
		slog.Warn("could not write token usage temp file", "error", err)
		return
	}
	if err := os.Rename(tmpPath, path); err != nil {
		slog.Warn("could not rename token usage temp file", "error", err)
		return
	}

	// Update last-saved watermarks so the next save computes the correct
	// delta. Also update in-memory counters to reflect the merged on-disk
	// totals (includes other instances' contributions).
	s.tokenMux.Lock()
	s.lastSavedIn = currentIn
	s.lastSavedOut = currentOut
	// If another instance wrote tokens while we held the lock, our
	// in-memory view should reflect the merged total so that getClaudeInfo
	// reports accurate numbers.
	if currentDate == s.todayDate {
		s.todayTokensIn = merged.InputIn
		s.todayTokensOut = merged.OutputOut
		// Re-base lastSaved to merged totals so the next delta is correct.
		s.lastSavedIn = merged.InputIn
		s.lastSavedOut = merged.OutputOut
	}
	s.tokenMux.Unlock()
}

// extractCommandsFromResponse parses an LLM thinking response to find
// executable commands. It handles multiple formats (#9440):
//   - Lines prefixed with "CMD: ", "CMD:", "Command: ", "command:" (case-insensitive)
//   - kubectl/helm/oc commands inside markdown fenced code blocks (```...```)
//   - Bare kubectl/helm/oc commands on standalone lines
func extractCommandsFromResponse(content string) []string {
	var commands []string
	seen := make(map[string]bool) // deduplicate commands
	inCodeBlock := false

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)

		// Track markdown fenced code block boundaries
		if strings.HasPrefix(trimmed, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}

		// 1. Check for CMD:/Command: prefix (case-insensitive)
		if m := cmdPrefixRe.FindStringSubmatch(trimmed); m != nil {
			cmd := strings.TrimSpace(m[1])
			if cmd != "" && !seen[cmd] {
				seen[cmd] = true
				commands = append(commands, cmd)
			}
			continue
		}

		// 2. Inside a code block, accept kubectl/helm/oc commands
		if inCodeBlock {
			if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
				seen[trimmed] = true
				commands = append(commands, trimmed)
			}
			continue
		}

		// 3. Bare kubectl/helm/oc commands outside code blocks (standalone lines)
		if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
			seen[trimmed] = true
			commands = append(commands, trimmed)
		}
	}

	return commands
}

// KeyStatus represents the status of an API key for a provider
type KeyStatus struct {
	Provider    string `json:"provider"`
	DisplayName string `json:"displayName"`
	Configured  bool   `json:"configured"`
	Source      string `json:"source,omitempty"` // "env" or "config"
	Valid       *bool  `json:"valid,omitempty"`  // nil = not tested, true/false = test result
	Error       string `json:"error,omitempty"`
	// BaseURL is the currently-resolved base URL for this provider (env var,
	// then ~/.kc/config.yaml, then compiled default). Empty when the provider
	// does not support a base URL override (vendor HTTP APIs).
	BaseURL string `json:"baseURL,omitempty"`
	// BaseURLEnvVar is the environment variable this provider honors for
	// base URL overrides (e.g. "OLLAMA_URL", "GROQ_BASE_URL"). Empty when
	// the provider has no base URL override. Surfaced to the UI so the
	// Advanced section can show the env var name as an operator hint.
	BaseURLEnvVar string `json:"baseURLEnvVar,omitempty"`
	// BaseURLSource is "env" when the current BaseURL value came from the
	// env var, "config" when it came from ~/.kc/config.yaml, or empty when
	// the resolved value is the compiled-in default.
	BaseURLSource string `json:"baseURLSource,omitempty"`
}

// KeysStatusResponse is the response for GET /settings/keys.
// RegisteredProviders is populated from the live agent registry so the
// frontend settings UI can display only providers that are actually
// registered in the backend, avoiding stale hardcoded lists (#9488).
type KeysStatusResponse struct {
	Keys                []KeyStatus    `json:"keys"`
	ConfigPath          string         `json:"configPath"`
	RegisteredProviders []ProviderInfo `json:"registeredProviders"`
}

// SetKeyRequest is the request body for POST /settings/keys.
// Setting APIKey requires a valid key; setting BaseURL is independent
// (operators can configure a base URL without an API key, which is the
// common path for unauthenticated local LLM runners).
//
// To clear a previously-set base URL (reverting to the compiled-in default),
// set ClearBaseURL=true with an empty BaseURL. This avoids the "missing
// field" guard that rejects requests where all three fields are empty (#8259).
type SetKeyRequest struct {
	Provider     string `json:"provider"`
	APIKey       string `json:"apiKey,omitempty"`
	Model        string `json:"model,omitempty"`
	BaseURL      string `json:"baseURL,omitempty"`
	ClearBaseURL bool   `json:"clearBaseURL,omitempty"`
}

// handleSettingsKeys handles GET and POST for /settings/keys
