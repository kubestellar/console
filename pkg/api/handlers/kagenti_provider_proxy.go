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
	"github.com/kubestellar/console/pkg/kagentiprovider"
	"github.com/kubestellar/console/pkg/store"
)

// kagentiSSELineBufferBytes is the per-line read buffer for SSE streaming responses.
// 256 KB handles large JSON payloads in a single SSE event.
const kagentiSSELineBufferBytes = 256 * 1024

const (
	clusterContextTimeout         = 10 * time.Second
	kagentiDirectToolDefaultLimit = 50
	kagentiDirectToolMaxItems     = 50
)

type kagentiDirectClusterInfo struct {
	Name      string `json:"name"`
	Healthy   bool   `json:"healthy"`
	NodeCount int    `json:"nodeCount,omitempty"`
	PodCount  int    `json:"podCount,omitempty"`
}

type kagentiDirectContainerInfo struct {
	Name   string `json:"name"`
	Image  string `json:"image"`
	Ready  bool   `json:"ready"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}

type kagentiDirectPodInfo struct {
	Name       string                       `json:"name"`
	Namespace  string                       `json:"namespace"`
	Cluster    string                       `json:"cluster,omitempty"`
	Status     string                       `json:"status"`
	Ready      string                       `json:"ready"`
	Restarts   int                          `json:"restarts"`
	Age        string                       `json:"age"`
	Containers []kagentiDirectContainerInfo `json:"containers,omitempty"`
}

type kagentiDirectEventInfo struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Count     int32  `json:"count"`
	Age       string `json:"age,omitempty"`
	LastSeen  string `json:"lastSeen,omitempty"`
}

// KagentiProviderProxyHandler proxies requests to the kagenti A2A endpoint.
type KagentiProviderProxyHandler struct {
	client        *kagentiprovider.KagentiClient // can be nil if kagenti not detected
	configManager kagentiprovider.ConfigManager
	k8sClient     *k8s.MultiClusterClient
	store         store.Store
}

// NewKagentiProviderProxyHandler creates a new KagentiProviderProxyHandler.
func NewKagentiProviderProxyHandler(client *kagentiprovider.KagentiClient, configManager kagentiprovider.ConfigManager, k8sClient *k8s.MultiClusterClient, s store.Store) *KagentiProviderProxyHandler {
	return &KagentiProviderProxyHandler{
		client:        client,
		configManager: configManager,
		k8sClient:     k8sClient,
		store:         s,
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

func writeSSEDataEvent(w *bufio.Writer, payload string) error {
	for _, line := range strings.Split(payload, "\n") {
		if _, err := fmt.Fprintf(w, "data: %s\n", line); err != nil {
			return err
		}
	}
	_, err := fmt.Fprint(w, "\n")
	return err
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
					if err := writeSSEDataEvent(w, "[DONE]"); err != nil {
						return
					}
					w.Flush()
					doneSent = true
					break
				}

				text := extractTextFromChunk(payload)
				if err := writeSSEDataEvent(w, text); err != nil {
					return
				}
				w.Flush()
			}

			if err != nil {
				if err != io.EOF {
					slog.Error("kagenti SSE stream interrupted", "error", err)
					if writeErr := writeSSEDataEvent(w, "{\"error\": \"stream interrupted\"}"); writeErr == nil {
						w.Flush()
					}
				}
				break
			}
		}

		if !doneSent {
			if err := writeSSEDataEvent(w, "[DONE]"); err == nil {
				w.Flush()
			}
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

	status, err := h.configManager.UpdateConfig(c.Context(), kagentiprovider.ConfigUpdate{
		LLMProvider: req.LLMProvider,
		APIKey:      req.APIKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, kagentiprovider.ErrUnsupportedLLMProvider):
			slog.Warn("kagenti provider config update: unsupported provider", "error", err)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported llm provider"})
		case errors.Is(err, kagentiprovider.ErrAPIKeyRequired):
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
	contextBuilder.WriteString("- get_cluster_list: Returns cluster names with health and counts\n")
	contextBuilder.WriteString("- get_pod_list(cluster, namespace): Returns a limited safe subset of pod status data\n")
	contextBuilder.WriteString("- get_events(cluster, namespace): Returns a limited safe subset of recent warning events\n")
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
		"description": "Returns a limited safe subset of pod status data for a specific cluster and namespace",
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
					"description": "Maximum number of pods to return (default: 50, max: 50)",
				},
			},
			"required": []string{"cluster"},
		},
	})

	tools = append(tools, map[string]any{
		"name":        "get_events",
		"description": "Returns a limited safe subset of recent warning events from a specific cluster and namespace",
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
					"description": "Maximum number of events to return (default: 50, max: 50)",
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

func extractKagentiDirectToolLimit(args map[string]any) int {
	limit := kagentiDirectToolDefaultLimit
	if raw, ok := args["limit"].(float64); ok && raw > 0 {
		limit = int(raw)
	}
	if limit > kagentiDirectToolMaxItems {
		return kagentiDirectToolMaxItems
	}
	return limit
}

func sanitizeKagentiDirectClusters(clusters []k8s.ClusterInfo) []kagentiDirectClusterInfo {
	result := make([]kagentiDirectClusterInfo, 0, len(clusters))
	for _, cluster := range clusters {
		result = append(result, kagentiDirectClusterInfo{
			Name:      cluster.Name,
			Healthy:   cluster.Healthy,
			NodeCount: cluster.NodeCount,
			PodCount:  cluster.PodCount,
		})
	}
	return result
}

func sanitizeKagentiDirectPods(pods []k8s.PodInfo, limit int) []kagentiDirectPodInfo {
	if limit > len(pods) {
		limit = len(pods)
	}
	result := make([]kagentiDirectPodInfo, 0, limit)
	for _, pod := range pods[:limit] {
		containers := make([]kagentiDirectContainerInfo, 0, len(pod.Containers))
		for _, container := range pod.Containers {
			containers = append(containers, kagentiDirectContainerInfo{
				Name:   container.Name,
				Image:  container.Image,
				Ready:  container.Ready,
				State:  container.State,
				Reason: container.Reason,
			})
		}
		result = append(result, kagentiDirectPodInfo{
			Name:       pod.Name,
			Namespace:  pod.Namespace,
			Cluster:    pod.Cluster,
			Status:     pod.Status,
			Ready:      pod.Ready,
			Restarts:   pod.Restarts,
			Age:        pod.Age,
			Containers: containers,
		})
	}
	return result
}

func sanitizeKagentiDirectEvents(events []k8s.Event, limit int) []kagentiDirectEventInfo {
	if limit > len(events) {
		limit = len(events)
	}
	result := make([]kagentiDirectEventInfo, 0, limit)
	for _, event := range events[:limit] {
		result = append(result, kagentiDirectEventInfo{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    event.Object,
			Namespace: event.Namespace,
			Cluster:   event.Cluster,
			Count:     event.Count,
			Age:       event.Age,
			LastSeen:  event.LastSeen,
		})
	}
	return result
}

// CallToolDirect routes tool calls to the appropriate console handlers
func (h *KagentiProviderProxyHandler) CallToolDirect(c *fiber.Ctx) error {
	if err := requireEditorOrAdmin(c, h.store); err != nil {
		return err
	}
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
		"result": sanitizeKagentiDirectClusters(clusters),
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
	limit := extractKagentiDirectToolLimit(args)

	ctx, cancel := context.WithTimeout(c.Context(), clusterContextTimeout)
	defer cancel()

	pods, err := h.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		slog.Error("get_pod_list failed", "error", err, "cluster", cluster, "namespace", namespace)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch pods"})
	}

	return c.JSON(fiber.Map{
		"tool":   "get_pod_list",
		"result": sanitizeKagentiDirectPods(pods, limit),
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
	limit := extractKagentiDirectToolLimit(args)

	ctx, cancel := context.WithTimeout(c.Context(), clusterContextTimeout)
	defer cancel()

	events, err := h.k8sClient.GetEvents(ctx, cluster, namespace, limit)
	if err != nil {
		slog.Error("get_events failed", "error", err, "cluster", cluster, "namespace", namespace)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch events"})
	}

	return c.JSON(fiber.Map{
		"tool":   "get_events",
		"result": sanitizeKagentiDirectEvents(events, limit),
	})
}
