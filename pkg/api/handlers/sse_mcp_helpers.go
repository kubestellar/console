package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/safego"
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
	sanitized := sseReplaceAll(sseReplaceAll(eventName, "\n", ""), "\r", "")

	jsonData, err := sseMarshalJSON(data)
	if err != nil {
		slog.Error("[SSE] marshal error", "error", err)
		return err
	}
	if _, err := w.WriteString("event: " + sanitized + "\ndata: " + string(jsonData) + "\n\n"); err != nil {
		return err
	}
	return w.Flush()
}

// sseMarshalJSON marshals v to JSON, stripping the trailing newline added by json.Encoder.
func sseMarshalJSON(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	b := buf.Bytes()
	if len(b) > 0 && b[len(b)-1] == '\n' {
		b = b[:len(b)-1]
	}
	return b, nil
}

// sseReplaceAll replaces all occurrences of old with new in s.
// Uses a distinct name to avoid collisions with any strings.ReplaceAll import.
func sseReplaceAll(s, old, new string) string {
	result := ""
	for len(s) > 0 {
		idx := sseIndexOf(s, old)
		if idx == -1 {
			result += s
			break
		}
		result += s[:idx] + new
		s = s[idx+len(old):]
	}
	return result
}

// sseIndexOf returns the index of the first occurrence of substr in s, or -1 if not found.
func sseIndexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
