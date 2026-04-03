package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// maxResponseDeadline is the maximum time any multi-cluster REST handler will
// wait before returning whatever data has been collected. This is a fallback
// for when SSE streaming is not used. Set to 30s to allow healthy clusters
// time to respond (offline clusters are now skipped via HealthyClusters).
const maxResponseDeadline = 30 * time.Second

// mcpHealthTimeout is the timeout for multi-cluster health check aggregation.
const mcpHealthTimeout = 60 * time.Second

// mcpDefaultTimeout is the per-cluster timeout for standard MCP data fetches.
const mcpDefaultTimeout = 15 * time.Second

// mcpExtendedTimeout is the per-cluster timeout for heavier MCP operations
// (e.g. deployments, GPU queries) that may need extra time.
const mcpExtendedTimeout = 30 * time.Second

// waitWithDeadline waits for all goroutines in wg to finish, but returns
// early if the deadline is reached. When the deadline fires, cancel is
// called to signal the in-flight goroutines to stop, so they exit promptly
// rather than running indefinitely in the background. Returns true if the
// deadline was hit (partial results), false if all goroutines completed in
// time.
func waitWithDeadline(wg *sync.WaitGroup, cancel context.CancelFunc, deadline time.Duration) bool {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	timer := time.NewTimer(deadline)
	defer timer.Stop()
	select {
	case <-done:
		return false
	case <-timer.C:
		cancel()
		return true
	}
}

// handleK8sError inspects a Kubernetes API error and returns the appropriate
// HTTP response. Cluster-connectivity errors (network, auth, timeout,
// certificate) are returned as 200 with a "clusterStatus":"unavailable"
// payload so the frontend can show a degraded state instead of a broken page.
// All other errors are returned as 500 Internal Server Error.
func handleK8sError(c *fiber.Ctx, err error) error {
	errType := k8s.ClassifyError(err.Error())
	switch errType {
	case "network", "auth", "timeout", "certificate":
		slog.Info(fmt.Sprintf("cluster unavailable (%s): %v", errType, err))
		return c.JSON(fiber.Map{
			"clusterStatus": "unavailable",
			"errorType":     errType,
			"errorMessage":  err.Error(),
		})
	default:
		slog.Error(fmt.Sprintf("internal error: %v", err))
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
}

// MCPHandlers handles MCP-related API endpoints
type MCPHandlers struct {
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// NewMCPHandlers creates a new MCP handlers instance
func NewMCPHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) *MCPHandlers {
	return &MCPHandlers{
		bridge:    bridge,
		k8sClient: k8sClient,
	}
}

// GetStatus returns the MCP bridge status
func (h *MCPHandlers) GetStatus(c *fiber.Ctx) error {
	status := fiber.Map{
		"k8sClient": h.k8sClient != nil,
	}

	if h.bridge != nil {
		bridgeStatus := h.bridge.Status()
		status["mcpBridge"] = bridgeStatus
	} else {
		status["mcpBridge"] = fiber.Map{"available": false}
	}

	return c.JSON(status)
}

// GetOpsTools returns available kubestellar-ops tools
func (h *MCPHandlers) GetOpsTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetOpsTools()
	return c.JSON(fiber.Map{"tools": tools})
}

// GetDeployTools returns available kubestellar-deploy tools
func (h *MCPHandlers) GetDeployTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetDeployTools()
	return c.JSON(fiber.Map{"tools": tools})
}

