package gitops

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// Helper functions and constants for the gitops package.

// maxResponseDeadline is the maximum time gitops handlers will wait before
// returning whatever data has been collected (copied from parent handlers package).
const maxResponseDeadline = 30 * time.Second

// maxK8sNameLen is the maximum allowed length for Kubernetes resource names (RFC 1123).
const maxK8sNameLen = 253

// isDemoMode checks if the request is in demo mode.
func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

// errNoClusterAccess returns a 503 error indicating no cluster access.
func errNoClusterAccess(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "No cluster access"})
}

// handleK8sError returns an appropriate HTTP error for Kubernetes API errors.
func handleK8sError(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
}

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
// Returns an error if the write or flush fails (e.g., client disconnected).
func writeSSEEvent(w *bufio.Writer, eventName string, data interface{}) error {
	// Sanitize eventName: strip characters that would break the SSE wire format.
	sanitized := strings.NewReplacer("\n", "", "\r", "").Replace(eventName)

	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("[SSE] marshal error", "error", err)
		return fmt.Errorf("marshal: %w", err)
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", sanitized, jsonData); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Flush(); err != nil {
		return fmt.Errorf("flush: %w", err)
	}
	return nil
}

// streamDemoSSE sends demo data as a single instant SSE event.
func streamDemoSSE(c *fiber.Ctx, dataKey string, demoData interface{}) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		if err := writeSSEEvent(w, "cluster_data", fiber.Map{
			"cluster": "demo",
			dataKey:   demoData,
			"source":  "demo",
		}); err != nil {
			slog.Info("[SSE] demo stream write failed", "event", "cluster_data", "error", err)
			return
		}
		if err := writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     1,
			"completedClusters": 1,
		}); err != nil {
			slog.Info("[SSE] demo stream write failed", "event", "done", "error", err)
		}
	})

	return nil
}

// requireAdmin delegates to the auth package.
func requireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}

// waitWithDeadline waits for all goroutines in wg to finish, but returns
// early if the deadline is reached. When the deadline fires, cancel is
// called to signal the in-flight goroutines to stop.
func waitWithDeadline(wg *sync.WaitGroup, cancel context.CancelFunc, deadline time.Duration) bool {
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
