package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestWriteSSEEvent_BasicFormat(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	data := map[string]string{"key": "value"}
	if err := WriteSSEEvent(w, "test_event", data); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	output := buf.String()
	if !strings.HasPrefix(output, "event: test_event\n") {
		t.Errorf("expected output to start with 'event: test_event\\n', got: %q", output)
	}
	if !strings.Contains(output, "data: ") {
		t.Error("expected output to contain 'data: '")
	}
	// SSE frames end with double newline
	if !strings.HasSuffix(output, "\n\n") {
		t.Errorf("expected output to end with double newline, got: %q", output)
	}
}

func TestWriteSSEEvent_JSONData(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	data := map[string]interface{}{
		"total":   42,
		"cluster": "prod",
	}
	if err := WriteSSEEvent(w, "cluster_data", data); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	// Extract the data line
	output := buf.String()
	lines := strings.Split(output, "\n")
	var dataLine string
	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			dataLine = strings.TrimPrefix(line, "data: ")
			break
		}
	}
	if dataLine == "" {
		t.Fatal("no data: line found in output")
	}

	// Verify it's valid JSON
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(dataLine), &parsed); err != nil {
		t.Fatalf("data line is not valid JSON: %v", err)
	}
	if parsed["cluster"] != "prod" {
		t.Errorf("parsed[cluster] = %v, want %q", parsed["cluster"], "prod")
	}
}

func TestWriteSSEEvent_SanitizesNewlines(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	// Newlines in event name would break SSE framing — must be stripped
	if err := WriteSSEEvent(w, "evil\nevent\rname", "data"); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	output := buf.String()
	// The event name should have newlines stripped
	if !strings.HasPrefix(output, "event: evileventname\n") {
		t.Errorf("expected sanitized event name, got: %q", output[:min(len(output), 40)])
	}
}

func TestWriteSSEEvent_EmptyEventName(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	if err := WriteSSEEvent(w, "", "hello"); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	output := buf.String()
	if !strings.HasPrefix(output, "event: \n") {
		t.Errorf("expected empty event name to produce 'event: \\n', got: %q", output[:min(len(output), 20)])
	}
}

func TestWriteSSEEvent_MarshalError(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	// Channels cannot be marshaled to JSON
	err := WriteSSEEvent(w, "test", make(chan int))
	if err == nil {
		t.Fatal("expected marshal error for non-serializable data")
	}
	if !strings.Contains(err.Error(), "marshal") {
		t.Errorf("expected error to mention 'marshal', got: %v", err)
	}
}

func TestWriteSSEEvent_StringData(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	if err := WriteSSEEvent(w, "message", "plain text"); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	output := buf.String()
	// String data should be JSON-encoded (quoted)
	if !strings.Contains(output, `data: "plain text"`) {
		t.Errorf("expected JSON-encoded string in data, got: %q", output)
	}
}

func TestWriteSSEEvent_NullData(t *testing.T) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)

	if err := WriteSSEEvent(w, "empty", nil); err != nil {
		t.Fatalf("WriteSSEEvent returned error: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "data: null") {
		t.Errorf("expected 'data: null', got: %q", output)
	}
}


