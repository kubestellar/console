package handlers

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/kagenti_provider"
)

// kagentiSSELineBufferBytes is the per-line read buffer for SSE streaming responses.
// 256 KB handles large JSON payloads in a single SSE event.
const kagentiSSELineBufferBytes = 256 * 1024

// KagentiProviderProxyHandler proxies requests to the kagenti A2A endpoint.
type KagentiProviderProxyHandler struct {
	client        *kagenti_provider.KagentiClient // can be nil if kagenti not detected
	configManager kagenti_provider.ConfigManager
}

// NewKagentiProviderProxyHandler creates a new KagentiProviderProxyHandler.
func NewKagentiProviderProxyHandler(client *kagenti_provider.KagentiClient, configManager kagenti_provider.ConfigManager) *KagentiProviderProxyHandler {
	return &KagentiProviderProxyHandler{client: client, configManager: configManager}
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

	stream, err := h.client.Invoke(c.Context(), req.Namespace, req.Agent, req.Message, req.ContextID, nil)
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
		case errors.Is(err, kagenti_provider.ErrUnsupportedLLMProvider), errors.Is(err, kagenti_provider.ErrAPIKeyRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
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
