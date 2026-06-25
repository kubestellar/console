package gitops

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// maxResponseDeadline is the maximum time any multi-cluster REST handler will
// wait before returning whatever data has been collected. This is a fallback
// for when SSE streaming is not used. Set to 30s to allow healthy clusters
// time to respond (offline clusters are now skipped via HealthyClusters).
const maxResponseDeadline = 30 * time.Second

// waitWithDeadline waits for all goroutines in wg to finish, but returns
// early if the deadline is reached. When the deadline fires, cancel is
// called to signal the in-flight goroutines to stop, so they exit promptly
// rather than running indefinitely in the background. Returns true if the
// deadline was hit (partial results), false if all goroutines completed in
// time.
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

// requireAdmin checks if the current user has admin privileges.
func requireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}

// isDemoMode checks if the request has the X-Demo-Mode header set to "true"
// When demo mode is enabled, handlers should return demo data immediately
// without attempting to connect to real clusters
func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

// noClusterAccessMsg is the unified error message returned by every handler
// when the Kubernetes client is unavailable (e.g., no kubeconfig loaded, or
// the kc-agent websocket is disconnected). Keeping this as a single constant
// ensures the message stays in sync across handlers (#9830).
const noClusterAccessMsg = "No cluster access"

func errNoClusterAccess(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": noClusterAccessMsg})
}

// streamDemoSSE streams demo data as a single SSE event for endpoints
// that support server-sent events.
func streamDemoSSE(c *fiber.Ctx, dataKey string, demoData interface{}) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
		writeSSEEvent(w, "demo_data", fiber.Map{dataKey: demoData, "source": "demo"})
		writeSSEEvent(w, "done", fiber.Map{"demo": true})
	})
	return nil
}

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
// Returns an error if the write or flush fails (e.g., client disconnected).
//
// #7050 — eventName is sanitized by stripping \n and \r to prevent SSE frame
// injection if a future caller inadvertently passes user-controlled input.
func writeSSEEvent(w *bufio.Writer, eventName string, data interface{}) error {
	// Sanitize eventName: strip characters that would break the SSE wire format.
	sanitized := eventName
	for _, char := range []string{"\n", "\r"} {
		sanitized = replaceAll(sanitized, char, "")
	}

	jsonData, err := jsonMarshal(data)
	if err != nil {
		slog.Error("[SSE] marshal error", "error", err)
		return err
	}
	if _, err := w.WriteString("event: " + sanitized + "\ndata: " + string(jsonData) + "\n\n"); err != nil {
		return err
	}
	if err := w.Flush(); err != nil {
		return err
	}
	return nil
}

// jsonMarshal is a helper to marshal JSON
func jsonMarshal(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	// Remove the trailing newline added by Encoder
	b := buf.Bytes()
	if len(b) > 0 && b[len(b)-1] == '\n' {
		b = b[:len(b)-1]
	}
	return b, nil
}

// replaceAll replaces all occurrences of old with new in s
func replaceAll(s, old, new string) string {
	if old == "" {
		return s
	}
	result := ""
	for len(s) > 0 {
		idx := indexOf(s, old)
		if idx == -1 {
			result += s
			break
		}
		result += s[:idx] + new
		s = s[idx+len(old):]
	}
	return result
}

// indexOf returns the index of the first occurrence of substr in s, or -1 if not found
func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// handleK8sError handles errors from Kubernetes API calls
func handleK8sError(c *fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}
	slog.Error("[gitops] k8s error", "error", err)
	
	// Check for specific error types
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "Request timeout"})
	}
	
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kubernetes operation failed"})
}
