package mcp

import (
	"bufio"
	"bytes"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
