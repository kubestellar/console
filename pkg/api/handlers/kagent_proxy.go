package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/kagent"
)

// KagentProxyHandler proxies requests to the kagent A2A endpoint.
type KagentProxyHandler struct {
	client *kagent.KagentClient // can be nil if kagent not detected
}

// NewKagentProxyHandler creates a new KagentProxyHandler.
func NewKagentProxyHandler(client *kagent.KagentClient) *KagentProxyHandler {
	return &KagentProxyHandler{client: client}
}

// GetStatus returns the kagent controller availability status.
func (h *KagentProxyHandler) GetStatus(c *fiber.Ctx) error {
	if h.client == nil {
		return c.JSON(fiber.Map{"available": false, "reason": "not configured"})
	}
	available, err := h.client.Status()
	if err != nil {
		return c.JSON(fiber.Map{"available": false, "reason": err.Error()})
	}
	return c.JSON(fiber.Map{"available": available, "url": ""})
}

// ListAgents returns known kagent agents.
func (h *KagentProxyHandler) ListAgents(c *fiber.Ctx) error {
	if h.client == nil {
		return c.JSON(fiber.Map{"agents": []interface{}{}})
	}
	agents, err := h.client.ListAgents()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"agents": agents})
}

// chatRequest is the request body for the Chat endpoint.
type chatRequest struct {
	Agent     string `json:"agent"`
	Namespace string `json:"namespace"`
	Message   string `json:"message"`
	ContextID string `json:"contextId,omitempty"`
}

// Chat streams a kagent agent conversation via SSE.
func (h *KagentProxyHandler) Chat(c *fiber.Ctx) error {
	if h.client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "kagent not configured"})
	}

	var req chatRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Agent == "" || req.Namespace == "" || req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "agent, namespace, and message are required"})
	}

	stream, err := h.client.Invoke(c.Context(), req.Namespace, req.Agent, req.Message, req.ContextID)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	defer stream.Close()

	// Set SSE headers
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		scanner := bufio.NewScanner(stream)
		// Use a 64KB buffer for potentially large chunks
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, len(buf))

		for scanner.Scan() {
			line := scanner.Text()
			fmt.Fprintf(w, "data: %s\n\n", line)
			w.Flush()
		}

		if err := scanner.Err(); err != nil {
			// Stream was interrupted — send error event instead of [DONE]
			fmt.Fprintf(w, "data: {\"error\": \"stream interrupted\"}\n\n")
			w.Flush()
			return
		}

		fmt.Fprintf(w, "data: [DONE]\n\n")
		w.Flush()
	})

	return nil
}

// callToolRequest is the request body for the CallTool endpoint.
type callToolRequest struct {
	Agent     string         `json:"agent"`
	Namespace string         `json:"namespace"`
	Tool      string         `json:"tool"`
	Args      map[string]any `json:"args"`
}

// CallTool invokes a tool through a kagent agent via A2A.
func (h *KagentProxyHandler) CallTool(c *fiber.Ctx) error {
	if h.client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "kagent not configured"})
	}

	var req callToolRequest
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

	stream, err := h.client.Invoke(c.Context(), req.Namespace, req.Agent, message, "")
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	defer stream.Close()

	body, err := io.ReadAll(stream)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to read agent response"})
	}

	return c.JSON(fiber.Map{
		"tool":   req.Tool,
		"result": string(body),
	})
}
