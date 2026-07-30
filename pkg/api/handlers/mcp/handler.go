package mcp

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// MaxResponseDeadline is the maximum time any multi-cluster REST handler will
// wait before returning whatever data has been collected. This is a fallback
// for when SSE streaming is not used. Set to 30s to allow healthy clusters
// time to respond (offline clusters are now skipped via HealthyClusters).
const MaxResponseDeadline = 30 * time.Second

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
func WaitWithDeadline(wg *sync.WaitGroup, cancel context.CancelFunc, deadline time.Duration) bool {
	done := make(chan struct{})
	safego.Go(func() {
		wg.Wait()
		close(done)
	})
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
var sanitizedErrorMessages = handlers.SanitizedErrorMessages

// HandleK8sError delegates to handlers.HandleK8sError for backward compatibility
// within the mcp package.
func HandleK8sError(c *fiber.Ctx, err error) error {
	return handlers.HandleK8sError(c, err)
}

// clusterErrorTracker collects per-cluster failures during multi-cluster
// fan-out operations. Thread-safe via its own mutex.
type clusterErrorTracker struct {
	mu     sync.Mutex
	errors []handlers.ClusterError
}

func (t *clusterErrorTracker) add(cluster string, err error) {
	errType := k8s.ClassifyError(err.Error())
	msg, ok := sanitizedErrorMessages[errType]
	if !ok {
		msg = "An internal error occurred"
	}
	slog.Info("[MCP] per-cluster error", "cluster", cluster, "errorType", errType, "error", err)
	t.mu.Lock()
	t.errors = append(t.errors, handlers.ClusterError{
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
	store     store.Store
}

// NewMCPHandlers creates a new MCP handlers instance
func NewMCPHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient, s store.Store) *MCPHandlers {
	return &MCPHandlers{
		bridge:    bridge,
		k8sClient: k8sClient,
		store:     s,
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
