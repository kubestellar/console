package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/kagenti_provider"
)

// kagentiSSELineBufferBytes is the per-line read buffer for SSE streaming responses.
// 256 KB handles large JSON payloads in a single SSE event.
const kagentiSSELineBufferBytes = 256 * 1024

const (
	clusterContextTimeout = 10 * time.Second
)

// KagentiProviderProxyHandler proxies requests to the kagenti A2A endpoint.
type KagentiProviderProxyHandler struct {
	client        *kagenti_provider.KagentiClient // can be nil if kagenti not detected
	configManager kagenti_provider.ConfigManager
	k8sClient     *k8s.MultiClusterClient
}

// NewKagentiProviderProxyHandler creates a new KagentiProviderProxyHandler.
func NewKagentiProviderProxyHandler(client *kagenti_provider.KagentiClient, configManager kagenti_provider.ConfigManager, k8sClient *k8s.MultiClusterClient) *KagentiProviderProxyHandler {
	return &KagentiProviderProxyHandler{
		client:        client,
		configManager: configManager,
		k8sClient:     k8sClient,
	}
}

// GetStatus returns the kagenti controller availability status.
func (h *KagentiProviderProxyHandler) GetStatus(c *fiber.Ctx) error {
	if h.client == nil {
		return c.JSON(fiber.Map{"available": false, "reason": "not configured"})
	}
	available, err := h.client.Status()
	if err != nil {
		slog.Error("kagenti provider status check failed", "error", err)
		return c.JSON(fiber.Map{"available": false, "reason": "provider unavailable"})
	}

	response := fiber.Map{"available": available, "url": "", "config_supported": false}
	if h.configManager != nil {
		status, statusErr := h.configManager.GetStatus(c.Context())
		if statusErr != nil {
			slog.Warn("kagenti provider config status check failed", "error", statusErr)
			response["config_supported"] = false
			response["config_reason"] = "config unavailable"
		} else if status != nil {
			response["llm_provider"] = status.LLMProvider
			response["api_key_configured"] = status.APIKeyConfigured
			response["configured_providers"] = status.ConfiguredProviders
			response["config_supported"] = true
		}
	}
	return c.JSON(response)
}

// ListAgents returns known kagenti agents.
func (h *KagentiProviderProxyHandler) ListAgents(c *fiber.Ctx) error {
	if h.client == nil {
		return c.JSON(fiber.Map{"agents": []interface{}{}})
	}
	agents, err := h.client.ListAgents()
	if err != nil {
		slog.Error("kagenti provider list agents failed", "error", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "upstream error"})
	}
	return c.JSON(fiber.Map{"agents": agents})
}

// kagentiChatRequest is the request body for the Chat endpoint.
type kagentiChatRequest struct {
	Agent     string `json:"agent"`
	Namespace string `json:"namespace"`
	Message   string `json:"message"`
	ContextID string `json:"contextId,omitempty"`
}

// Chat streams a kagenti agent conversation via SSE.
func (h *KagentiProviderProxyHandler) Chat(c *fiber.Ctx) error {
	if h.client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "kagenti not configured"})
	}

	var req kagentiChatRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Agent == "" || req.Namespace == "" || req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "agent, namespace, and message are required"})
	}

	// Inject cluster context into the message
	enrichedMessage := h.enrichMessageWithClusterContext(c.Context(), req.Message)

	stream, err := h.client.Invoke(c.Context(), req.Namespace, req.Agent, enrichedMessage, req.ContextID, nil)
	if err != nil {
		slog.Error("kagenti provider invoke failed", "error", err, "agent", req.Agent, "namespace", req.Namespace)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream error"})
	}
	// stream is closed inside the stream writer callback.

	// Set SSE headers
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer stream.Close()

		reader := bufio.NewReaderSize(stream, kagentiSSELineBufferBytes)
		doneSent := false

		for {
			line, err := reader.ReadString('\n')
			line = strings.TrimRight(line, "\r\n")

			if line != "" {
				payload := line
				if strings.HasPrefix(line, "data: ") {
					payload = line[6:]
				}

				if payload == "[DONE]" {
					fmt.Fprintf(w, "data: [DONE]\n\n")
					w.Flush()
					doneSent = true
					break
				}

				text := extractTextFromChunk(payload)
				fmt.Fprintf(w, "data: %s\n\n", text)
				w.Flush()
			}

			if err != nil {
				if err != io.EOF {
					slog.Error("kagenti SSE stream interrupted", "error", err)
					fmt.Fprintf(w, "data: {\"error\": \"stream interrupted\"}\n\n")
					w.Flush()
				}
				break
			}
		}

		if !doneSent {
			fmt.Fprintf(w, "data: [DONE]\n\n")
			w.Flush()
		}
	})

	return nil
}

// extractTextFromChunk extracts text fields from known JSON chunk shapes.
func extractTextFromChunk(s string) string {
	if len(s) == 0 || s[0] != '{' {
		return s // not JSON, pass through as-is
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return s
	}
	// {"type": "text", "text": "..."}
	if raw, ok := m["text"]; ok {
		var t string
		if json.Unmarshal(raw, &t) == nil {
			return t
		}
	}
	// {"content": "..."}
	if raw, ok := m["content"]; ok {
		var t string
		if json.Unmarshal(raw, &t) == nil {
			return t
		}
	}
	// {"delta": {"text": "..."}}
	if raw, ok := m["delta"]; ok {
		var delta map[string]json.RawMessage
		if json.Unmarshal(raw, &delta) == nil {
			if tRaw, ok := delta["text"]; ok {
				var t string
				if json.Unmarshal(tRaw, &t) == nil {
					return t
				}
			}
		}
	}
	return s // unknown schema, pass through raw
}

// kagentiCallToolRequest is the request body for the CallTool endpoint.
type kagentiCallToolRequest struct {
	Agent     string         `json:"agent"`
	Namespace string         `json:"namespace"`
	Tool      string         `json:"tool"`
	Args      map[string]any `json:"args"`
}

type kagentiConfigUpdateRequest struct {
	LLMProvider string `json:"llm_provider"`
	APIKey      string `json:"api_key,omitempty"`
}

// UpdateConfig updates the in-cluster Kagenti LLM provider configuration.
func (h *KagentiProviderProxyHandler) UpdateConfig(c *fiber.Ctx) error {
	if h.configManager == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "kagenti config not available"})
	}

	var req kagentiConfigUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if strings.TrimSpace(req.LLMProvider) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "llm_provider is required"})
	}

	status, err := h.configManager.UpdateConfig(c.Context(), kagenti_provider.ConfigUpdate{
		LLMProvider: req.LLMProvider,
		APIKey:      req.APIKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, kagenti_provider.ErrUnsupportedLLMProvider):
			slog.Warn("kagenti provider config update: unsupported provider", "error", err)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported llm provider"})
		case errors.Is(err, kagenti_provider.ErrAPIKeyRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "api key required for selected provider"})
		default:
			slog.Error("kagenti provider config update failed", "error", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update kagenti config"})
		}
	}

	return c.JSON(fiber.Map{
		"llm_provider":         status.LLMProvider,
		"api_key_configured":   status.APIKeyConfigured,
		"configured_providers": status.ConfiguredProviders,
	})
}

// CallTool invokes a tool through a kagenti agent via A2A.
func (h *KagentiProviderProxyHandler) CallTool(c *fiber.Ctx) error {
	if h.client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "kagenti not configured"})
	}

	var req kagentiCallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Agent == "" || req.Namespace == "" || req.Tool == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "agent, namespace, and tool are required"})
	}

	argsJSON, err := json.Marshal(req.Args)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "failed to serialize tool args"})
	}

	message := fmt.Sprintf("Please use the tool %s with args %s", req.Tool, string(argsJSON))

	stream, err := h.client.Invoke(c.Context(), req.Namespace, req.Agent, message, "", nil)
	if err != nil {
		slog.Error("kagenti provider tool invocation failed", "error", err, "agent", req.Agent, "namespace", req.Namespace, "tool", req.Tool)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream error"})
	}
	defer stream.Close()

	// #7964 — bound the agent response so one runaway invocation cannot
	// force unbounded allocations. Shares maxAgentResponseBytes with the
	// kagent proxy since both expose the same A2A surface.
	body, err := io.ReadAll(io.LimitReader(stream, maxAgentResponseBytes+1))
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to read agent response"})
	}
	if int64(len(body)) > maxAgentResponseBytes {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("agent response exceeded max size of %d bytes", maxAgentResponseBytes),
		})
	}

	return c.JSON(fiber.Map{
		"tool":   req.Tool,
		"result": string(body),
	})
}

// enrichMessageWithClusterContext prepends cluster context to the user's message
func (h *KagentiProviderProxyHandler) enrichMessageWithClusterContext(ctx context.Context, message string) string {
	if h.k8sClient == nil {
		return message
	}

	ctxWithTimeout, cancel := context.WithTimeout(ctx, clusterContextTimeout)
	defer cancel()

	clusters, err := h.k8sClient.DeduplicatedClusters(ctxWithTimeout)
	if err != nil {
		slog.Warn("failed to fetch cluster list for kagenti context", "error", err)
		return message
	}

	if len(clusters) == 0 {
		return message
	}

	var contextBuilder strings.Builder
	contextBuilder.WriteString("--- SYSTEM CONTEXT ---\n")
	contextBuilder.WriteString("You have access to the following Kubernetes clusters:\n\n")

	for _, cluster := range clusters {
		contextBuilder.WriteString(fmt.Sprintf("Cluster: %s\n", cluster.Name))
		if cluster.Healthy {
			contextBuilder.WriteString("  Status: Healthy\n")
		} else {
			contextBuilder.WriteString("  Status: Unhealthy\n")
		}
		contextBuilder.WriteString(fmt.Sprintf("  Nodes: %d\n", cluster.NodeCount))
		contextBuilder.WriteString(fmt.Sprintf("  Pods: %d\n", cluster.PodCount))
		contextBuilder.WriteString("\n")
	}

	contextBuilder.WriteString("You can use the following tools to query cluster state:\n")
	contextBuilder.WriteString("- get_cluster_list: Returns detailed cluster information\n")
	contextBuilder.WriteString("- get_pod_list(cluster, namespace): Returns pods in a namespace\n")
	contextBuilder.WriteString("- get_events(cluster, namespace): Returns recent warning events\n")
	contextBuilder.WriteString("\n--- END CONTEXT ---\n\n")
	contextBuilder.WriteString(message)

	return contextBuilder.String()
}

// GetTools returns available console tools for kagenti agents
func (h *KagentiProviderProxyHandler) GetTools(c *fiber.Ctx) error {
	tools := make([]map[string]any, 0, 3)

	tools = append(tools, map[string]any{
		"name":        "get_cluster_list",
		"description": "Returns a list of all Kubernetes clusters with health status, node count, and pod count",
		"inputSchema": map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
	})

	tools = append(tools, map[string]any{
		"name":        "get_pod_list",
		"description": "Returns a list of pods in a specific cluster and namespace",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"cluster": map[string]any{
					"type":        "string",
					"description": "Cluster name",
				},
				"namespace": map[string]any{
					"type":        "string",
					"description": "Kubernetes namespace (leave empty for all namespaces)",
				},
			},
			"required": []string{"cluster"},
		},
	})

	tools = append(tools, map[string]any{
		"name":        "get_events",
		"description": "Returns recent warning events from a specific cluster and namespace",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"cluster": map[string]any{
					"type":        "string",
					"description": "Cluster name",
				},
				"namespace": map[string]any{
					"type":        "string",
					"description": "Kubernetes namespace (leave empty for all namespaces)",
				},
				"limit": map[string]any{
					"type":        "number",
					"description": "Maximum number of events to return (default: 50)",
				},
			},
			"required": []string{"cluster"},
		},
	})

	return c.JSON(fiber.Map{
		"tools": tools,
	})
}

// kagentiDirectToolRequest is the request body for direct tool invocation
type kagentiDirectToolRequest struct {
	Tool string         `json:"tool"`
	Args map[string]any `json:"args"`
}

// CallToolDirect routes tool calls to the appropriate console handlers
func (h *KagentiProviderProxyHandler) CallToolDirect(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "k8s client not available"})
	}

	var req kagentiDirectToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Tool == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tool name is required"})
	}

	switch req.Tool {
	case "get_cluster_list":
		return h.handleGetClusterList(c)
	case "get_pod_list":
		return h.handleGetPodList(c, req.Args)
	case "get_events":
		return h.handleGetEvents(c, req.Args)
	default:
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "unknown tool"})
	}
}

// handleGetClusterList implements the get_cluster_list tool
func (h *KagentiProviderProxyHandler) handleGetClusterList(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), clusterContextTimeout)
	defer cancel()

	clusters, err := h.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		slog.Error("get_cluster_list failed", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch clusters"})
	}

	return c.JSON(fiber.Map{
		"tool":   "get_cluster_list",
		"result": clusters,
	})
}

// handleGetPodList implements the get_pod_list tool
func (h *KagentiProviderProxyHandler) handleGetPodList(c *fiber.Ctx, args map[string]any) error {
	cluster, ok := args["cluster"].(string)
	if !ok || cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster parameter is required"})
	}

	namespace := ""
	if ns, ok := args["namespace"].(string); ok {
		namespace = ns
	}

	ctx, cancel := context.WithTimeout(c.Context(), clusterContextTimeout)
	defer cancel()

	pods, err := h.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Error("get_pod_list failed", "error", err, "cluster", cluster, "namespace", namespace)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch pods"})
	}

	return c.JSON(fiber.Map{
		"tool":   "get_pod_list",
		"result": pods,
	})
}

// handleGetEvents implements the get_events tool
func (h *KagentiProviderProxyHandler) handleGetEvents(c *fiber.Ctx, args map[string]any) error {
	cluster, ok := args["cluster"].(string)
	if !ok || cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster parameter is required"})
	}

	namespace := ""
	if ns, ok := args["namespace"].(string); ok {
		namespace = ns
	}

	const defaultEventLimit = 50
	limit := defaultEventLimit
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	ctx, cancel := context.WithTimeout(c.Context(), clusterContextTimeout)
	defer cancel()

	events, err := h.k8sClient.GetEvents(ctx, cluster, namespace, limit)
	if err != nil {
		slog.Error("get_events failed", "error", err, "cluster", cluster, "namespace", namespace)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch events"})
	}

	return c.JSON(fiber.Map{
		"tool":   "get_events",
		"result": events,
	})
}
