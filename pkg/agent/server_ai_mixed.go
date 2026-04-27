package agent

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

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
