package gitops

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsDemoMode(t *testing.T) {
	tests := []struct {
		name       string
		headerVal  string
		wantResult bool
	}{
		{
			name:       "demo mode enabled",
			headerVal:  "true",
			wantResult: true,
		},
		{
			name:       "demo mode disabled",
			headerVal:  "false",
			wantResult: false,
		},
		{
			name:       "no header",
			headerVal:  "",
			wantResult: false,
		},
		{
			name:       "invalid header value",
			headerVal:  "yes",
			wantResult: false,
		},
		{
			name:       "case sensitive - True",
			headerVal:  "True",
			wantResult: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				result := isDemoMode(c)
				if result != tt.wantResult {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mismatch"})
				}
				return c.JSON(fiber.Map{"isDemoMode": result})
			})

			req, err := http.NewRequest(http.MethodGet, "/test", nil)
			require.NoError(t, err)
			if tt.headerVal != "" {
				req.Header.Set("X-Demo-Mode", tt.headerVal)
			}

			resp, err := app.Test(req, fiberTestTimeout)
			require.NoError(t, err)
			assert.Equal(t, http.StatusOK, resp.StatusCode)
		})
	}
}

func TestJsonMarshal(t *testing.T) {
	tests := []struct {
		name      string
		input     interface{}
		want      string
		wantError bool
	}{
		{
			name:      "empty object",
			input:     fiber.Map{},
			want:      "{}",
			wantError: false,
		},
		{
			name:      "simple map",
			input:     fiber.Map{"key": "value"},
			want:      `{"key":"value"}`,
			wantError: false,
		},
		{
			name:      "nested object",
			input:     fiber.Map{"outer": fiber.Map{"inner": "value"}},
			want:      `{"outer":{"inner":"value"}}`,
			wantError: false,
		},
		{
			name:      "array",
			input:     []string{"a", "b", "c"},
			want:      `["a","b","c"]`,
			wantError: false,
		},
		{
			name:      "number",
			input:     42,
			want:      "42",
			wantError: false,
		},
		{
			name:      "boolean",
			input:     true,
			want:      "true",
			wantError: false,
		},
		{
			name:      "null",
			input:     nil,
			want:      "null",
			wantError: false,
		},
		{
			name:      "string with special characters",
			input:     fiber.Map{"text": "line1\nline2\ttab"},
			want:      `{"text":"line1\nline2\ttab"}`,
			wantError: false,
		},
		{
			name:      "empty array",
			input:     []string{},
			want:      "[]",
			wantError: false,
		},
		{
			name: "complex nested structure",
			input: fiber.Map{
				"users": []fiber.Map{
					{"name": "Alice", "age": 30},
					{"name": "Bob", "age": 25},
				},
			},
			want:      `{"users":[{"age":30,"name":"Alice"},{"age":25,"name":"Bob"}]}`,
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := jsonMarshal(tt.input)
			if tt.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, string(got))

			// Verify no trailing newline
			if len(got) > 0 {
				assert.NotEqual(t, byte('\n'), got[len(got)-1], "jsonMarshal should strip trailing newline")
			}
		})
	}
}

func TestReplaceAll(t *testing.T) {
	tests := []struct {
		name string
		s    string
		old  string
		new  string
		want string
	}{
		{
			name: "single occurrence",
			s:    "hello world",
			old:  "world",
			new:  "golang",
			want: "hello golang",
		},
		{
			name: "multiple occurrences",
			s:    "foo bar foo baz foo",
			old:  "foo",
			new:  "qux",
			want: "qux bar qux baz qux",
		},
		{
			name: "no occurrences",
			s:    "hello world",
			old:  "missing",
			new:  "replacement",
			want: "hello world",
		},
		{
			name: "empty string",
			s:    "",
			old:  "any",
			new:  "replacement",
			want: "",
		},
		{
			name: "replace with empty string",
			s:    "remove this word",
			old:  " this",
			new:  "",
			want: "remove word",
		},
		{
			name: "replace empty string with something",
			s:    "abc",
			old:  "",
			new:  "X",
			want: "abc",
		},
		{
			name: "overlapping pattern",
			s:    "aaaa",
			old:  "aa",
			new:  "b",
			want: "bb",
		},
		{
			name: "newline replacement",
			s:    "line1\nline2\nline3",
			old:  "\n",
			new:  " ",
			want: "line1 line2 line3",
		},
		{
			name: "carriage return replacement",
			s:    "line1\rline2\rline3",
			old:  "\r",
			new:  "",
			want: "line1line2line3",
		},
		{
			name: "multi-character pattern",
			s:    "event: data\nevent: connected\nevent: done",
			old:  "event: ",
			new:  "type: ",
			want: "type: data\ntype: connected\ntype: done",
		},
		{
			name: "replace entire string",
			s:    "old",
			old:  "old",
			new:  "new",
			want: "new",
		},
		{
			name: "consecutive matches",
			s:    "ababab",
			old:  "ab",
			new:  "X",
			want: "XXX",
		},
		{
			name: "pattern longer than string",
			s:    "hi",
			old:  "hello",
			new:  "bye",
			want: "hi",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := replaceAll(tt.s, tt.old, tt.new)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestIndexOf(t *testing.T) {
	tests := []struct {
		name   string
		s      string
		substr string
		want   int
	}{
		{
			name:   "found at beginning",
			s:      "hello world",
			substr: "hello",
			want:   0,
		},
		{
			name:   "found in middle",
			s:      "hello world",
			substr: "o w",
			want:   4,
		},
		{
			name:   "found at end",
			s:      "hello world",
			substr: "world",
			want:   6,
		},
		{
			name:   "not found",
			s:      "hello world",
			substr: "missing",
			want:   -1,
		},
		{
			name:   "empty substring",
			s:      "hello",
			substr: "",
			want:   0,
		},
		{
			name:   "empty string",
			s:      "",
			substr: "any",
			want:   -1,
		},
		{
			name:   "both empty",
			s:      "",
			substr: "",
			want:   0,
		},
		{
			name:   "substring longer than string",
			s:      "hi",
			substr: "hello",
			want:   -1,
		},
		{
			name:   "multiple occurrences - returns first",
			s:      "foo bar foo baz",
			substr: "foo",
			want:   0,
		},
		{
			name:   "single character",
			s:      "abcdef",
			substr: "d",
			want:   3,
		},
		{
			name:   "newline character",
			s:      "line1\nline2",
			substr: "\n",
			want:   5,
		},
		{
			name:   "exact match",
			s:      "exact",
			substr: "exact",
			want:   0,
		},
		{
			name:   "partial overlap at end",
			s:      "hello",
			substr: "lox",
			want:   -1,
		},
		{
			name:   "unicode string",
			s:      "hello 世界",
			substr: "世界",
			want:   6,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := indexOf(tt.s, tt.substr)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestReplaceAll_UsesIndexOf(t *testing.T) {
	// Integration test to ensure replaceAll correctly uses indexOf
	// Edge case: pattern that appears at various positions
	s := "abcabcabc"
	old := "abc"
	new := "X"
	want := "XXX"
	got := replaceAll(s, old, new)
	assert.Equal(t, want, got, "replaceAll should use indexOf to find all occurrences")
}

func TestJsonMarshal_NoTrailingNewline(t *testing.T) {
	// Regression test for #7050 - jsonMarshal must strip trailing newline
	// added by json.Encoder to prevent SSE frame injection
	data := fiber.Map{"event": "test\ndata"}
	result, err := jsonMarshal(data)
	require.NoError(t, err)

	// Verify no trailing newline
	assert.NotEqual(t, byte('\n'), result[len(result)-1])

	// Verify we can still unmarshal it
	var decoded fiber.Map
	err = json.Unmarshal(result, &decoded)
	require.NoError(t, err)
	assert.Equal(t, data, decoded)
}
