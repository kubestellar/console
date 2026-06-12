package gitops

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
)

const noClusterAccessMsg = "No cluster access"

// isDemoMode checks if the request is in demo mode based on X-Demo-Mode header
func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

// errNoClusterAccess returns a standardized error when no cluster access is available
func errNoClusterAccess(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": noClusterAccessMsg})
}

// handleK8sError returns a standardized error response for Kubernetes errors
func handleK8sError(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
}

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
// Returns an error if the write or flush fails (e.g., client disconnected).
//
// #7050 — eventName is sanitized by stripping \n and \r to prevent SSE frame
// injection if a future caller inadvertently passes user-controlled input.
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
			slog.Info("[SSE] done event write failed", "error", err)
		}
	})

	return nil
}
