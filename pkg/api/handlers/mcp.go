package handlers

import (
	"context"
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

// sanitizedErrorMessages maps error types to user-friendly messages that do
// not expose internal infrastructure details (#4753).
var sanitizedErrorMessages = map[string]string{
	"network":     "Cluster is unreachable — check network connectivity",
	"auth":        "Authentication to cluster failed — check credentials",
	"timeout":     "Cluster request timed out — the cluster may be overloaded or unreachable",
	"certificate": "TLS certificate error — check cluster certificate configuration",
}

// handleK8sError inspects a Kubernetes API error and returns the appropriate
// HTTP response. Cluster-connectivity errors (network, auth, timeout,
// certificate) are returned as 200 with a "clusterStatus":"unavailable"
// payload so the frontend can show a degraded state instead of a broken page.
// All other errors are returned as 500 Internal Server Error.
// Raw error details are only logged server-side and never sent to the client (#4753).
func handleK8sError(c *fiber.Ctx, err error) error {
	errType := k8s.ClassifyError(err.Error())
	switch errType {
	case "not_found":
		// Invalid or non-existent cluster — return 404 with consistent error format (#4907, #4908)
		slog.Info("[MCP] cluster not found", "errorType", errType, "error", err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"clusterStatus": "not_found",
			"errorType":     errType,
			"errorMessage":  "Cluster not found — verify the cluster name exists in your kubeconfig",
		})
	case "network", "auth", "timeout", "certificate":
		// Cluster exists but is unreachable — return 503 with consistent error format (#4908)
		slog.Info("[MCP] cluster unavailable", "errorType", errType, "error", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"clusterStatus": "unavailable",
			"errorType":     errType,
			"errorMessage":  sanitizedErrorMessages[errType],
		})
	default:
		slog.Error("[MCP] internal error", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"clusterStatus": "error",
			"errorType":     "internal",
			"errorMessage":  "An internal error occurred",
		})
	}
}

// ClusterError represents a per-cluster failure in a multi-cluster request (#4758).
// Included in the response so the frontend can distinguish "no resources" from
// "cluster failed" and display an appropriate degraded-state indicator.
type ClusterError struct {
	Cluster   string `json:"cluster"`
	ErrorType string `json:"errorType"`
	Message   string `json:"message"`
}

// clusterErrorTracker collects per-cluster failures during multi-cluster
// fan-out operations. Thread-safe via its own mutex.
type clusterErrorTracker struct {
	mu     sync.Mutex
	errors []ClusterError
}

func (t *clusterErrorTracker) add(cluster string, err error) {
	errType := k8s.ClassifyError(err.Error())
	msg, ok := sanitizedErrorMessages[errType]
	if !ok {
		msg = "An internal error occurred"
	}
	slog.Info("[MCP] per-cluster error", "cluster", cluster, "errorType", errType, "error", err)
	t.mu.Lock()
	t.errors = append(t.errors, ClusterError{
		Cluster:   cluster,
		ErrorType: errType,
		Message:   msg,
	})
	t.mu.Unlock()
}

// annotate adds partial-failure metadata to a response map when there were
// cluster errors. If all clusters succeeded, the response is unchanged.
func (t *clusterErrorTracker) annotate(resp fiber.Map) fiber.Map {
	t.mu.Lock()
	errs := t.errors
	t.mu.Unlock()
	if len(errs) > 0 {
		resp["partial"] = true
		resp["clusterErrors"] = errs
	}
	return resp
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

