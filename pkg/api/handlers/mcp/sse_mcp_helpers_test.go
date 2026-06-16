package mcp

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	// sseTestFastWorkDuration is a short work duration that finishes well before any deadline.
	sseTestFastWorkDuration = 10 * time.Millisecond
	// sseTestGenerousDeadline is a deadline comfortably longer than sseTestFastWorkDuration.
	sseTestGenerousDeadline = 200 * time.Millisecond
	// sseTestSlowWorkDuration simulates a goroutine that is slower than the tight deadline.
	sseTestSlowWorkDuration = 500 * time.Millisecond
	// sseTestTightDeadline fires before sseTestSlowWorkDuration to trigger a timeout.
	sseTestTightDeadline = 50 * time.Millisecond
	// sseTestZeroGoroutineDeadline is used when there are no goroutines to wait for.
	sseTestZeroGoroutineDeadline = 100 * time.Millisecond
	// sseTestFiberTimeoutMS is the Fiber app.Test timeout in milliseconds.
	sseTestFiberTimeoutMS = 5000
)

func TestSseReplaceAll(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		old      string
		new      string
		expected string
	}{
		{
			name:     "replace single occurrence",
			input:    "hello world",
			old:      "world",
			new:      "golang",
			expected: "hello golang",
		},
		{
			name:     "replace multiple occurrences",
			input:    "foo bar foo baz foo",
			old:      "foo",
			new:      "qux",
			expected: "qux bar qux baz qux",
		},
		{
			name:     "replace newlines",
			input:    "line1\nline2\nline3",
			old:      "\n",
			new:      "",
			expected: "line1line2line3",
		},
		{
			name:     "no match",
			input:    "hello world",
			old:      "xyz",
			new:      "abc",
			expected: "hello world",
		},
		{
			name:     "empty input",
			input:    "",
			old:      "foo",
			new:      "bar",
			expected: "",
		},
		{
			name:     "replace with empty string",
			input:    "hello world",
			old:      " ",
			new:      "",
			expected: "helloworld",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sseReplaceAll(tt.input, tt.old, tt.new)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSseIndexOf(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		substr   string
		expected int
	}{
		{
			name:     "found at beginning",
			input:    "hello world",
			substr:   "hello",
			expected: 0,
		},
		{
			name:     "found in middle",
			input:    "hello world",
			substr:   "wo",
			expected: 6,
		},
		{
			name:     "found at end",
			input:    "hello world",
			substr:   "rld",
			expected: 8,
		},
		{
			name:     "not found",
			input:    "hello world",
			substr:   "xyz",
			expected: -1,
		},
		{
			name:     "empty substring",
			input:    "hello",
			substr:   "",
			expected: 0,
		},
		{
			name:     "substring longer than input",
			input:    "hi",
			substr:   "hello",
			expected: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sseIndexOf(tt.input, tt.substr)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSseMarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected string
	}{
		{
			name:     "simple map",
			input:    fiber.Map{"status": "ok"},
			expected: `{"status":"ok"}`,
		},
		{
			name:     "map with number",
			input:    fiber.Map{"count": 42},
			expected: `{"count":42}`,
		},
		{
			name:     "nested structure",
			input:    fiber.Map{"data": fiber.Map{"key": "value"}},
			expected: `{"data":{"key":"value"}}`,
		},
		{
			name:     "array",
			input:    []string{"a", "b", "c"},
			expected: `["a","b","c"]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := sseMarshalJSON(tt.input)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, string(result))
			// Verify no trailing newline
			assert.False(t, bytes.HasSuffix(result, []byte("\n")))
		})
	}
}

func TestWriteSSEEvent(t *testing.T) {
	tests := []struct {
		name      string
		eventName string
		data      interface{}
		checkFunc func(t *testing.T, output string)
	}{
		{
			name:      "simple event",
			eventName: "message",
			data:      fiber.Map{"text": "hello"},
			checkFunc: func(t *testing.T, output string) {
				assert.Contains(t, output, "event: message")
				assert.Contains(t, output, `data: {"text":"hello"}`)
				assert.Contains(t, output, "\n\n")
			},
		},
		{
			name:      "sanitize newline in event name",
			eventName: "bad\nevent",
			data:      fiber.Map{"value": 1},
			checkFunc: func(t *testing.T, output string) {
				assert.Contains(t, output, "event: badevent")
				assert.NotContains(t, output, "event: bad\nevent")
			},
		},
		{
			name:      "sanitize carriage return in event name",
			eventName: "bad\revent",
			data:      fiber.Map{"value": 2},
			checkFunc: func(t *testing.T, output string) {
				assert.Contains(t, output, "event: badevent")
				assert.NotContains(t, output, "event: bad\revent")
			},
		},
		{
			name:      "complex data structure",
			eventName: "update",
			data:      fiber.Map{"items": []int{1, 2, 3}, "total": 3},
			checkFunc: func(t *testing.T, output string) {
				assert.Contains(t, output, "event: update")
				assert.Contains(t, output, `"items":[1,2,3]`)
				assert.Contains(t, output, `"total":3`)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			w := bufio.NewWriter(&buf)

			err := writeSSEEvent(w, tt.eventName, tt.data)
			require.NoError(t, err)

			output := buf.String()
			tt.checkFunc(t, output)
		})
	}
}

func TestWriteSSEEvent_ErrorHandling(t *testing.T) {
	t.Run("marshal error - invalid data", func(t *testing.T) {
		var buf bytes.Buffer
		w := bufio.NewWriter(&buf)

		// Channel cannot be marshaled to JSON
		err := writeSSEEvent(w, "test", make(chan int))
		assert.Error(t, err)
	})
}

// TestWaitWithDeadlineSSE tests the unexported waitWithDeadline helper defined in
// sse_mcp_helpers.go (distinct from the exported WaitWithDeadline in handler.go).
func TestWaitWithDeadlineSSE(t *testing.T) {
	tests := []struct {
		name         string
		goroutines   int
		workDuration time.Duration
		deadline     time.Duration
		wantTimeout  bool
	}{
		{
			name:         "all goroutines complete before deadline",
			goroutines:   3,
			workDuration: sseTestFastWorkDuration,
			deadline:     sseTestGenerousDeadline,
			wantTimeout:  false,
		},
		{
			name:         "deadline reached before goroutines finish",
			goroutines:   3,
			workDuration: sseTestSlowWorkDuration,
			deadline:     sseTestTightDeadline,
			wantTimeout:  true,
		},
		{
			name:         "zero goroutines completes immediately",
			goroutines:   0,
			workDuration: 0,
			deadline:     sseTestZeroGoroutineDeadline,
			wantTimeout:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var wg sync.WaitGroup
			ctx, cancel := context.WithCancel(context.Background())

			for i := 0; i < tt.goroutines; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					select {
					case <-time.After(tt.workDuration):
					case <-ctx.Done():
					}
				}()
			}

			timedOut := waitWithDeadline(&wg, cancel, tt.deadline)
			cancel() // ensure cleanup even when not timed out

			assert.Equal(t, tt.wantTimeout, timedOut)
		})
	}
}

// TestStreamDemoSSE verifies that streamDemoSSE sets the correct SSE headers
// and writes connected / demo_data / done events to the response.
func TestStreamDemoSSE(t *testing.T) {
	tests := []struct {
		name     string
		dataKey  string
		demoData interface{}
	}{
		{
			name:     "string demo data",
			dataKey:  "pods",
			demoData: []string{"pod-1", "pod-2"},
		},
		{
			name:     "map demo data",
			dataKey:  "status",
			demoData: fiber.Map{"healthy": true, "count": 3},
		},
		{
			name:     "nil demo data",
			dataKey:  "items",
			demoData: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/sse", func(c *fiber.Ctx) error {
				return streamDemoSSE(c, tt.dataKey, tt.demoData)
			})

			req := httptest.NewRequest("GET", "/sse", nil)
			resp, err := app.Test(req, sseTestFiberTimeoutMS)
			require.NoError(t, err)
			defer resp.Body.Close()

			// Verify SSE headers
			assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
			assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			bodyStr := string(body)

			// All three mandatory events must be present
			assert.Contains(t, bodyStr, "event: connected")
			assert.Contains(t, bodyStr, "event: demo_data")
			assert.Contains(t, bodyStr, "event: done")

			// demo_data event must contain source=demo and the correct data key
			assert.Contains(t, bodyStr, `"source":"demo"`)
			assert.Contains(t, bodyStr, `"`+tt.dataKey+`"`)

			// done event must carry demo:true
			assert.Contains(t, bodyStr, `"demo":true`)
		})
	}
}
