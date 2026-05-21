package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	kagentiContextFetchTimeout        = 8 * time.Second
	kagentiMaxPodIssuesPerCluster     = 10
	kagentiMaxWarningEventsPerCluster = 5
	// kagentiMaxConcurrentClusterFetches limits parallel cluster snapshot fetches
	// to prevent goroutine explosion and K8s API thundering herd in large fleets (#15003).
	kagentiMaxConcurrentClusterFetches = 10
)

type kagentiClusterSnapshot struct {
	Name          string             `json:"name"`
	Context       string             `json:"context"`
	Health        *k8s.ClusterHealth `json:"health,omitempty"`
	PodIssues     []k8s.PodIssue     `json:"podIssues,omitempty"`
	WarningEvents []k8s.Event        `json:"warningEvents,omitempty"`
	Errors        []string           `json:"errors,omitempty"`
}

type kagentiK8sContextSnapshot struct {
	Scope       string                   `json:"scope"`
	GeneratedAt string                   `json:"generatedAt"`
	Clusters    []kagentiClusterSnapshot `json:"clusters"`
}

func (s *Server) enrichKagentiChatRequest(ctx context.Context, provider AIProvider, chatReq *ChatRequest) {
	if provider == nil || provider.Name() != "kagenti" || s.k8sClient == nil {
		return
	}

	clusterContext := ""
	if chatReq.Context != nil {
		clusterContext = chatReq.Context["clusterContext"]
	}

	k8sContext, err := s.buildKagentiK8sContext(ctx, clusterContext)
	if err != nil {
		slog.Warn("[Chat] failed to build kagenti cluster context", "error", err, "clusterContext", clusterContext)
		return
	}
	if k8sContext == "" {
		return
	}

	if chatReq.Context == nil {
		chatReq.Context = map[string]string{}
	}
	chatReq.Context[kagentiK8sContextKey] = k8sContext
}

func (s *Server) buildKagentiK8sContext(ctx context.Context, clusterContext string) (string, error) {
	fetchCtx, cancel := context.WithTimeout(ctx, kagentiContextFetchTimeout)
	defer cancel()

	clusters, err := s.resolveKagentiClusterScope(fetchCtx, clusterContext)
	if err != nil {
		return "", err
	}
	if len(clusters) == 0 {
		return "", nil
	}

	snapshots := make([]kagentiClusterSnapshot, len(clusters))
	var wg sync.WaitGroup
	sem := make(chan struct{}, kagentiMaxConcurrentClusterFetches)
	for i, cluster := range clusters {
		i, cluster := i, cluster
		wg.Add(1)
		sem <- struct{}{}
		safego.Go(func() {
			defer wg.Done()
			defer func() { <-sem }()
			snapshots[i] = s.collectKagentiClusterSnapshot(fetchCtx, cluster)
		})
	}
	wg.Wait()

	payload := kagentiK8sContextSnapshot{
		Scope:       clusterContext,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Clusters:    snapshots,
	}
	if payload.Scope == "" {
		payload.Scope = "all-visible-clusters"
	}

	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal kagenti context: %w", err)
	}
	return string(data), nil
}

func (s *Server) resolveKagentiClusterScope(ctx context.Context, clusterContext string) ([]k8s.ClusterInfo, error) {
	if clusterContext != "" {
		return []k8s.ClusterInfo{{Name: clusterContext, Context: clusterContext}}, nil
	}

	clusters, err := s.k8sClient.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(clusters))
	result := make([]k8s.ClusterInfo, 0, len(clusters))
	for _, cluster := range clusters {
		contextName := cluster.Context
		if contextName == "" {
			contextName = cluster.Name
		}
		if contextName == "" {
			continue
		}
		if _, ok := seen[contextName]; ok {
			continue
		}
		seen[contextName] = struct{}{}
		cluster.Context = contextName
		if cluster.Name == "" {
			cluster.Name = contextName
		}
		result = append(result, cluster)
	}
	return result, nil
}

func (s *Server) collectKagentiClusterSnapshot(ctx context.Context, cluster k8s.ClusterInfo) kagentiClusterSnapshot {
	contextName := cluster.Context
	if contextName == "" {
		contextName = cluster.Name
	}

	snapshot := kagentiClusterSnapshot{
		Name:    cluster.Name,
		Context: contextName,
	}
	if snapshot.Name == "" {
		snapshot.Name = contextName
	}

	health, err := s.k8sClient.GetClusterHealth(ctx, contextName)
	if err != nil {
		snapshot.Errors = append(snapshot.Errors, fmt.Sprintf("health: %v", err))
	} else {
		snapshot.Health = health
	}

	podIssues, err := s.k8sClient.FindPodIssues(ctx, contextName, "")
	if err != nil {
		snapshot.Errors = append(snapshot.Errors, fmt.Sprintf("podIssues: %v", err))
	} else {
		if len(podIssues) > kagentiMaxPodIssuesPerCluster {
			podIssues = podIssues[:kagentiMaxPodIssuesPerCluster]
		}
		snapshot.PodIssues = podIssues
	}

	warningEvents, err := s.k8sClient.GetWarningEvents(ctx, contextName, "", kagentiMaxWarningEventsPerCluster)
	if err != nil {
		snapshot.Errors = append(snapshot.Errors, fmt.Sprintf("warningEvents: %v", err))
	} else {
		snapshot.WarningEvents = warningEvents
	}

	return snapshot
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
		return s.errorResponse(msg.ID, "agent_unavailable", "AI agent is not available - API key may be missing")
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

	// #10463: Use ChatOnlySystemPrompt for providers that cannot execute
	// commands, so the AI never claims it can run kubectl when it cannot.
	if !provider.Capabilities().HasCapability(CapabilityToolExec) {
		chatReq.SystemPrompt = ChatOnlySystemPrompt
	}

	// Thread cluster context for non-streaming path (#9485).
	if req.ClusterContext != "" {
		chatReq.Context = map[string]string{
			"clusterContext": req.ClusterContext,
		}
	}

	parent := context.Background()
	if len(parentCtx) > 0 && parentCtx[0] != nil {
		parent = parentCtx[0]
	}

	s.enrichKagentiChatRequest(parent, provider, chatReq)

	// #6678 — Previously this used context.Background() with no deadline,
	// which meant a hung AI provider would block the WebSocket goroutine
	// forever (the caller was a synchronous path from the read loop).
	// Wrap with a 30s default timeout so a misbehaving provider cannot
	// permanently wedge the WS reader goroutine. 30s matches the default
	// used by InsightEnrichmentTimeout for similar short-form AI calls.
	// #9997 — Derive from a parent context (if provided) so client
	// disconnect cancels in-flight non-streaming AI calls.
	ctx, cancel := context.WithTimeout(parent, handleChatMessageTimeout)
	defer cancel()
	resp, err := provider.Chat(ctx, chatReq)
	if err != nil {
		slog.Error("[Chat] execution error", "agent", agentName, "error", err, "timeout", handleChatMessageTimeout)
		if ctx.Err() == context.DeadlineExceeded {
			return s.errorResponse(msg.ID, "timeout",
				fmt.Sprintf("AI agent did not respond within %s", handleChatMessageTimeout))
		}
		return s.errorResponse(msg.ID, "execution_error", "Failed to execute AI agent")
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
			IsError:   resp.ExitCode != 0,
			Usage: &protocol.ChatTokenUsage{
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
			},
			ToolsExecuted: resp.ToolsExecuted, // #13728 — Prevent false-positive completions
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
// show targeted guidance (e.g. "restart kc-agent") instead of a raw JSON blob.
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
		return "authentication_error", "Failed to authenticate with AI provider - check your API key"
	}

	// Rate limit (HTTP 429)
	if strings.Contains(errText, "status 429") ||
		strings.Contains(errText, "rate_limit") ||
		strings.Contains(errText, "rate limit") ||
		strings.Contains(errText, "too many requests") ||
		strings.Contains(errText, "resource_exhausted") {
		return "rate_limit", "Rate limit exceeded - please wait and try again"
	}

	return "execution_error", "Failed to get response from AI provider"
}
