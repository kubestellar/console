package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

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

// cancelAllChatsForConn cancels every active chat session that was started by
// the given WebSocket connection. Called when the read loop exits (client
// disconnect) to ensure AI goroutines do not outlive their connection (#9997).
//
// The cancel functions are collected under the lock and invoked after releasing
// it, mirroring the deadlock-prevention pattern in handleCancelChat (#7432).
func (s *Server) cancelAllChatsForConn(conn *websocket.Conn) {
	var toCancel []context.CancelFunc

	s.activeChatCtxsMu.Lock()
	for sessionID, entry := range s.activeChatCtxs {
		if entry.conn == conn {
			toCancel = append(toCancel, entry.cancel)
			delete(s.activeChatCtxs, sessionID)
		}
	}
	s.activeChatCtxsMu.Unlock()

	for _, cancel := range toCancel {
		cancel()
	}

	if len(toCancel) > 0 {
		slog.Info("[Chat] cancelled orphaned sessions on disconnect",
			"count", len(toCancel), "addr", conn.RemoteAddr())
	}
}

// handleCancelChatHTTP is the HTTP fallback for cancelling in-progress chat sessions.
// Used when the WebSocket connection is unavailable (e.g., disconnected during long agent runs).
func (s *Server) handleCancelChatHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
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

// handleChatMessage handles chat messages (both legacy claude and new chat types).
// This is the non-streaming version, kept for API compatibility.
// The parentCtx parameter allows callers to propagate connection-scoped
// cancellation; pass context.Background() when no parent is available (#9997).
func (s *Server) handleChatMessage(msg protocol.Message, forceAgent string, parentCtx ...context.Context) protocol.Message {
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
	// #9997 — Derive from a parent context (if provided) so client
	// disconnect cancels in-flight non-streaming AI calls.
	parent := context.Background()
	if len(parentCtx) > 0 && parentCtx[0] != nil {
		parent = parentCtx[0]
	}
	ctx, cancel := context.WithTimeout(parent, handleChatMessageTimeout)
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
