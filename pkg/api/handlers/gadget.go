package handlers

import (
	"context"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/mcp"
)

const gadgetTimeout = 30 * time.Second

// GadgetHandler handles Inspektor Gadget API endpoints
type GadgetHandler struct {
	bridge *mcp.Bridge
}

// NewGadgetHandler creates a new GadgetHandler
func NewGadgetHandler(bridge *mcp.Bridge) *GadgetHandler {
	return &GadgetHandler{bridge: bridge}
}

// GetStatus returns the Inspektor Gadget MCP client connection status
func (h *GadgetHandler) GetStatus(c *fiber.Ctx) error {
	status := h.bridge.Status()
	gadgetStatus, ok := status["gadgetClient"]
	if !ok {
		return c.JSON(fiber.Map{"available": false, "reason": "not configured"})
	}
	return c.JSON(gadgetStatus)
}

// GetTools returns available Inspektor Gadget tools
func (h *GadgetHandler) GetTools(c *fiber.Ctx) error {
	tools := h.bridge.GetGadgetTools()
	if tools == nil {
		return c.JSON(fiber.Map{"tools": []interface{}{}, "available": false})
	}

	toolNames := make([]string, len(tools))
	for i, t := range tools {
		toolNames[i] = t.Name
	}

	return c.JSON(fiber.Map{
		"tools":     toolNames,
		"available": true,
		"count":     len(tools),
	})
}

// traceRequest represents a gadget trace invocation request
type traceRequest struct {
	Tool string                 `json:"tool"`
	Args map[string]interface{} `json:"args"`
}

// RunTrace invokes an Inspektor Gadget tool
func (h *GadgetHandler) RunTrace(c *fiber.Ctx) error {
	var req traceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Tool == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tool name is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), gadgetTimeout)
	defer cancel()

	result, err := h.bridge.CallGadgetTool(ctx, req.Tool, req.Args)
	if err != nil {
		slog.Error("[Gadget] tool call failed", "tool", req.Tool, "error", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "gadget tool call failed"})
	}

	return c.JSON(fiber.Map{
		"tool":    req.Tool,
		"result":  result,
		"isError": result.IsError,
	})
}
