package handlers

import (
	"bufio"
	"context"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/safego"
)

// maxResponseDeadline is the maximum time any multi-cluster REST handler will
// wait before returning whatever data has been collected. Set to 30s to allow
// healthy clusters time to respond (offline clusters are skipped via HealthyClusters).
const maxResponseDeadline = 30 * time.Second

// waitWithDeadline waits for all goroutines in wg to finish, but returns
// early if the deadline is reached. When the deadline fires, cancel is
// called to signal the in-flight goroutines to stop. Returns true if the
// deadline was hit (partial results), false if all goroutines completed in time.
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

// streamDemoSSE streams demo data as a single SSE event for endpoints
// that support server-sent events.
func streamDemoSSE(c *fiber.Ctx, dataKey string, demoData interface{}) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"}) //nolint:errcheck
		WriteSSEEvent(w, "demo_data", fiber.Map{dataKey: demoData, "source": "demo"}) //nolint:errcheck
		WriteSSEEvent(w, "done", fiber.Map{"demo": true}) //nolint:errcheck
	})
	return nil
}
