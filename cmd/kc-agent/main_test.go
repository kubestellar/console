package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestParseAllowedOrigins(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "empty string returns nil",
			input:    "",
			expected: nil,
		},
		{
			name:     "single origin",
			input:    "http://localhost:3000",
			expected: []string{"http://localhost:3000"},
		},
		{
			name:     "multiple origins",
			input:    "http://localhost:3000,http://localhost:4000",
			expected: []string{"http://localhost:3000", "http://localhost:4000"},
		},
		{
			name:     "origins with surrounding whitespace are trimmed",
			input:    "http://localhost:3000 , http://localhost:4000 , http://localhost:5000",
			expected: []string{"http://localhost:3000", "http://localhost:4000", "http://localhost:5000"},
		},
		{
			name:     "empty entries between commas are dropped",
			input:    "http://localhost:3000,,http://localhost:4000",
			expected: []string{"http://localhost:3000", "http://localhost:4000"},
		},
		{
			name:     "whitespace-only entries are dropped",
			input:    "http://localhost:3000,   ,http://localhost:4000",
			expected: []string{"http://localhost:3000", "http://localhost:4000"},
		},
		{
			name:     "single whitespace-only input returns nil",
			input:    "   ",
			expected: nil,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseAllowedOrigins(tc.input)

			if len(got) != len(tc.expected) {
				t.Fatalf("got %d origins %v, want %d %v", len(got), got, len(tc.expected), tc.expected)
			}

			for i, origin := range got {
				if origin != tc.expected[i] {
					t.Errorf("origins[%d] = %q, want %q", i, origin, tc.expected[i])
				}
			}
		})
	}
}

func TestBuildLogHandler_DevModeEmitsText(t *testing.T) {
	var buf bytes.Buffer

	handler := buildLogHandler(&buf, true)
	if handler == nil {
		t.Fatal("buildLogHandler returned nil")
	}

	logger := slog.New(handler)
	logger.Debug("hello", "component", "kc-agent")

	line := buf.String()
	if line == "" {
		t.Fatal("expected debug log to be emitted in dev mode, got empty output")
	}

	// Text handler emits key=value pairs, not JSON.
	if strings.HasPrefix(strings.TrimSpace(line), "{") {
		t.Errorf("dev mode should use text handler, got JSON-looking line: %q", line)
	}
	if !strings.Contains(line, "hello") {
		t.Errorf("expected log line to contain message %q, got %q", "hello", line)
	}
	if !strings.Contains(line, "component=kc-agent") {
		t.Errorf("expected log line to contain %q, got %q", "component=kc-agent", line)
	}
}

func TestBuildLogHandler_ProductionEmitsJSON(t *testing.T) {
	var buf bytes.Buffer

	handler := buildLogHandler(&buf, false)
	if handler == nil {
		t.Fatal("buildLogHandler returned nil")
	}

	logger := slog.New(handler)
	logger.Info("started", "port", 8585)

	line := strings.TrimSpace(buf.String())
	if line == "" {
		t.Fatal("expected info log to be emitted in production mode, got empty output")
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(line), &payload); err != nil {
		t.Fatalf("expected JSON log line in production mode, unmarshal failed: %v — line: %q", err, line)
	}

	if got := payload["msg"]; got != "started" {
		t.Errorf("payload msg = %v, want %q", got, "started")
	}
	if got := payload["port"]; got != float64(8585) {
		t.Errorf("payload port = %v, want 8585", got)
	}
	if got := payload["level"]; got != "INFO" {
		t.Errorf("payload level = %v, want INFO", got)
	}
}

func TestBuildLogHandler_ProductionDropsDebug(t *testing.T) {
	var buf bytes.Buffer

	handler := buildLogHandler(&buf, false)
	logger := slog.New(handler)
	logger.Debug("noisy", "detail", "should-be-dropped")

	if buf.Len() != 0 {
		t.Errorf("expected debug log to be filtered out in production mode, got: %q", buf.String())
	}
}

func TestBuildLogHandler_DevModeIncludesDebug(t *testing.T) {
	var buf bytes.Buffer

	handler := buildLogHandler(&buf, true)
	logger := slog.New(handler)
	logger.Debug("visible", "detail", "should-be-emitted")

	if buf.Len() == 0 {
		t.Error("expected debug log to be emitted in dev mode, got empty output")
	}
	if !strings.Contains(buf.String(), "visible") {
		t.Errorf("expected debug log to contain %q, got %q", "visible", buf.String())
	}
}
