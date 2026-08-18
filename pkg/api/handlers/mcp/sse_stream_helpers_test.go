package mcp

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The SSE plumbing helpers below (streamEmptySSE, StreamDemoSSE, streamDemoSSE)
// had 0% coverage prior to this file. They are pure HTTP writers with no
// external dependencies, so we exercise them through fiber's app.Test and
// assert on the raw SSE frames written to the response body.
//
// Each test asserts a specific wire-format expectation (headers, event names,
// JSON payload) rather than a truthy "something was written" check — see the
// test-writing standards in CLAUDE.md.

const (
	sseContentType = "text/event-stream"
	sseCacheHeader = "no-cache"
)

func readAllSSE(t *testing.T, resp *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err, "read SSE body")
	require.NoError(t, resp.Body.Close())
	return string(body)
}

func TestStreamEmptySSE_HeadersAndDoneFrame(t *testing.T) {
	app := fiber.New()
	app.Get("/empty", streamEmptySSE)

	req := httptest.NewRequest(http.MethodGet, "/empty", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, sseContentType, resp.Header.Get("Content-Type"))
	assert.Equal(t, sseCacheHeader, resp.Header.Get("Cache-Control"))
	assert.Equal(t, "keep-alive", resp.Header.Get("Connection"))

	body := readAllSSE(t, resp)
	// Empty stream emits exactly one done frame.
	assert.True(t, strings.HasPrefix(body, "event: "+sseEventDone+"\n"),
		"body should start with the done event, got: %q", body)
	assert.True(t, strings.HasSuffix(body, "\n\n"),
		"SSE frame must end with a blank line, got: %q", body)

	// The data payload must be valid JSON with the expected cluster counters.
	dataLine := extractDataLine(t, body)
	var payload map[string]int
	require.NoError(t, json.Unmarshal([]byte(dataLine), &payload))
	assert.Equal(t, 0, payload["totalClusters"])
	assert.Equal(t, 0, payload["completedClusters"])
	assert.Equal(t, 0, payload["skippedOffline"])
}

func TestStreamDemoSSE_EmitsClusterDataThenDone(t *testing.T) {
	app := fiber.New()
	app.Get("/demo", func(c *fiber.Ctx) error {
		return StreamDemoSSE(c, "pods", []string{"pod-a", "pod-b"})
	})

	req := httptest.NewRequest(http.MethodGet, "/demo", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, sseContentType, resp.Header.Get("Content-Type"))

	body := readAllSSE(t, resp)
	frames := splitSSEFrames(body)
	require.Len(t, frames, 2, "expected exactly cluster_data + done, got frames: %q", frames)

	// Frame 1: cluster_data with demo payload.
	name, data := parseFrame(t, frames[0])
	assert.Equal(t, sseEventClusterData, name)
	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(data), &payload))
	assert.Equal(t, "demo", payload["cluster"])
	assert.Equal(t, "demo", payload["source"])
	pods, ok := payload["pods"].([]any)
	require.True(t, ok, "pods key must be a JSON array")
	assert.Equal(t, []any{"pod-a", "pod-b"}, pods)

	// Frame 2: done with counters.
	name, data = parseFrame(t, frames[1])
	assert.Equal(t, sseEventDone, name)
	var done map[string]int
	require.NoError(t, json.Unmarshal([]byte(data), &done))
	assert.Equal(t, 1, done["totalClusters"])
	assert.Equal(t, 1, done["completedClusters"])
}

func TestStreamDemoSSEHelper_LowercaseWrapper(t *testing.T) {
	// The unexported streamDemoSSE (sse_mcp_helpers.go) has a slightly
	// different frame sequence than StreamDemoSSE: connected → demo_data → done.
	app := fiber.New()
	app.Get("/lower", func(c *fiber.Ctx) error {
		return streamDemoSSE(c, "widgets", map[string]int{"count": 3})
	})

	req := httptest.NewRequest(http.MethodGet, "/lower", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	assert.Equal(t, "no", resp.Header.Get("X-Accel-Buffering"),
		"X-Accel-Buffering: no is required so nginx doesn't buffer SSE")

	body := readAllSSE(t, resp)
	frames := splitSSEFrames(body)
	require.Len(t, frames, 3)

	names := []string{}
	for _, f := range frames {
		n, _ := parseFrame(t, f)
		names = append(names, n)
	}
	assert.Equal(t, []string{"connected", "demo_data", "done"}, names)

	// The demo_data frame must carry the caller-supplied key.
	_, data := parseFrame(t, frames[1])
	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(data), &payload))
	assert.Equal(t, "demo", payload["source"])
	widgets, ok := payload["widgets"].(map[string]any)
	require.True(t, ok)
	assert.EqualValues(t, 3, widgets["count"])
}

// extractDataLine returns the "data: " payload from a single-frame SSE body.
func extractDataLine(t *testing.T, body string) string {
	t.Helper()
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "data: ") {
			return strings.TrimPrefix(line, "data: ")
		}
	}
	t.Fatalf("no data line in SSE body: %q", body)
	return ""
}

// splitSSEFrames splits a raw SSE body into its individual event frames.
// Each SSE frame is terminated by a blank line ("\n\n").
func splitSSEFrames(body string) []string {
	body = strings.TrimRight(body, "\n")
	if body == "" {
		return nil
	}
	return strings.Split(body, "\n\n")
}

// parseFrame returns the event name and the JSON data payload from a single
// SSE frame. Fails the test if the frame doesn't match the expected shape.
func parseFrame(t *testing.T, frame string) (string, string) {
	t.Helper()
	var name, data string
	for _, line := range strings.Split(frame, "\n") {
		switch {
		case strings.HasPrefix(line, "event: "):
			name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			data = strings.TrimPrefix(line, "data: ")
		}
	}
	require.NotEmpty(t, name, "frame is missing an event: line: %q", frame)
	require.NotEmpty(t, data, "frame is missing a data: line: %q", frame)
	return name, data
}
