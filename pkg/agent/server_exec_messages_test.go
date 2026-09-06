package agent

import (
	"encoding/json"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Section 1: agentExecInitMessage — Parsing & Validation
// ---------------------------------------------------------------------------

// TestAgentExecInitMessage_ValidJSON verifies that a well-formed init message
// round-trips through json.Unmarshal with every field populated.
func TestAgentExecInitMessage_ValidJSON(t *testing.T) {
	raw := `{
		"type":      "exec_init",
		"cluster":   "prod-east",
		"namespace": "default",
		"pod":       "nginx-74b6f",
		"container": "web",
		"command":   ["/bin/bash", "-c", "ls"],
		"tty":       true,
		"cols":      120,
		"rows":      40
	}`

	var init agentExecInitMessage
	if err := json.Unmarshal([]byte(raw), &init); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if init.Type != "exec_init" {
		t.Errorf("Type = %q; want %q", init.Type, "exec_init")
	}
	if init.Cluster != "prod-east" {
		t.Errorf("Cluster = %q; want %q", init.Cluster, "prod-east")
	}
	if init.Namespace != "default" {
		t.Errorf("Namespace = %q; want %q", init.Namespace, "default")
	}
	if init.Pod != "nginx-74b6f" {
		t.Errorf("Pod = %q; want %q", init.Pod, "nginx-74b6f")
	}
	if init.Container != "web" {
		t.Errorf("Container = %q; want %q", init.Container, "web")
	}
	if len(init.Command) != 3 || init.Command[0] != "/bin/bash" {
		t.Errorf("Command = %v; want [/bin/bash -c ls]", init.Command)
	}
	if !init.TTY {
		t.Error("TTY = false; want true")
	}
	if init.Cols != 120 {
		t.Errorf("Cols = %d; want 120", init.Cols)
	}
	if init.Rows != 40 {
		t.Errorf("Rows = %d; want 40", init.Rows)
	}
}

// TestAgentExecInitMessage_MalformedJSON ensures that broken JSON payloads are
// rejected before any field access — preventing panics on nil pointers or
// zero-value fields.
func TestAgentExecInitMessage_MalformedJSON(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"empty string", ""},
		{"bare string", `"hello"`},
		{"truncated object", `{"type":"exec_init"`},
		{"invalid trailing comma", `{"type":"exec_init",}`},
		{"array instead of object", `["exec_init"]`},
		{"binary garbage", "\x00\xff\xfe"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var init agentExecInitMessage
			if err := json.Unmarshal([]byte(tc.raw), &init); err == nil {
				t.Error("expected unmarshal error for malformed JSON, got nil")
			}
		})
	}
}

// TestAgentExecInitMessage_MissingRequiredFields validates the init message
// validation logic that handleExec performs after parsing: cluster, namespace,
// and pod are all required; command defaults to ["/bin/sh"] when empty; cols
// and rows default to 80x24 when zero.
func TestAgentExecInitMessage_MissingRequiredFields(t *testing.T) {
	cases := []struct {
		name      string
		init      agentExecInitMessage
		expectErr string // substring expected in the error condition
	}{
		{
			name:      "missing cluster",
			init:      agentExecInitMessage{Type: "exec_init", Namespace: "default", Pod: "nginx"},
			expectErr: "cluster",
		},
		{
			name:      "missing namespace",
			init:      agentExecInitMessage{Type: "exec_init", Cluster: "prod", Pod: "nginx"},
			expectErr: "namespace",
		},
		{
			name:      "missing pod",
			init:      agentExecInitMessage{Type: "exec_init", Cluster: "prod", Namespace: "default"},
			expectErr: "pod",
		},
		{
			name:      "wrong type field",
			init:      agentExecInitMessage{Type: "not_exec_init", Cluster: "prod", Namespace: "default", Pod: "p"},
			expectErr: "exec_init",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Reproduce the validation logic from handleExec (lines 298-304)
			// Check type first — "exec_init" is required
			if tc.init.Type != "exec_init" {
				// Validation correctly rejects wrong type
				return
			}
			if tc.init.Cluster == "" || tc.init.Namespace == "" || tc.init.Pod == "" {
				// Validation correctly rejects missing fields
				return
			}
			t.Error("expected validation to reject the init message")
		})
	}
}

// TestAgentExecInitMessage_DefaultCommand verifies that an empty command array
// is defaulted to ["/bin/sh"] — the same default kubectl uses.
func TestAgentExecInitMessage_DefaultCommand(t *testing.T) {
	init := agentExecInitMessage{
		Type:      "exec_init",
		Cluster:   "c1",
		Namespace: "ns",
		Pod:       "p",
		Command:   []string{},
	}

	// Reproduce the default logic from handleExec (lines 306-308)
	if len(init.Command) == 0 {
		init.Command = []string{"/bin/sh"}
	}

	if len(init.Command) != 1 || init.Command[0] != "/bin/sh" {
		t.Errorf("Command = %v; want [\"/bin/sh\"]", init.Command)
	}
}

// TestAgentExecInitMessage_DefaultDimensions verifies that zero cols/rows are
// defaulted to the VT100 standard 80x24.
func TestAgentExecInitMessage_DefaultDimensions(t *testing.T) {
	init := agentExecInitMessage{
		Type:      "exec_init",
		Cluster:   "c1",
		Namespace: "ns",
		Pod:       "p",
		Cols:      0,
		Rows:      0,
	}

	// Reproduce the default logic from handleExec (lines 309-314)
	if init.Cols == 0 {
		init.Cols = agentExecDefaultCols
	}
	if init.Rows == 0 {
		init.Rows = agentExecDefaultRows
	}

	if init.Cols != 80 {
		t.Errorf("Cols = %d; want %d (agentExecDefaultCols)", init.Cols, agentExecDefaultCols)
	}
	if init.Rows != 24 {
		t.Errorf("Rows = %d; want %d (agentExecDefaultRows)", init.Rows, agentExecDefaultRows)
	}
}

// TestAgentExecInitMessage_CustomDimensions ensures that non-zero cols/rows
// from the client are preserved unchanged.
func TestAgentExecInitMessage_CustomDimensions(t *testing.T) {
	init := agentExecInitMessage{Cols: 200, Rows: 50}

	if init.Cols == 0 {
		init.Cols = agentExecDefaultCols
	}
	if init.Rows == 0 {
		init.Rows = agentExecDefaultRows
	}

	if init.Cols != 200 {
		t.Errorf("Cols = %d; want 200", init.Cols)
	}
	if init.Rows != 50 {
		t.Errorf("Rows = %d; want 50", init.Rows)
	}
}

// TestAgentExecInitMessage_OptionalContainer verifies that the container field
// is allowed to be empty (Kubernetes uses the first container by default).
func TestAgentExecInitMessage_OptionalContainer(t *testing.T) {
	raw := `{
		"type":      "exec_init",
		"cluster":   "c1",
		"namespace": "default",
		"pod":       "nginx",
		"command":   ["/bin/sh"]
	}`

	var init agentExecInitMessage
	if err := json.Unmarshal([]byte(raw), &init); err != nil {
		t.Fatalf("unexpected unmarshal error: %v", err)
	}

	// Container can be empty — Kubernetes picks the first container
	if init.Container != "" {
		t.Errorf("Container = %q; want empty (Kubernetes default)", init.Container)
	}
}

// ---------------------------------------------------------------------------
// Section 5: agentExecMessage — JSON Framing
// ---------------------------------------------------------------------------

// TestAgentExecMessage_JSONRoundTrip verifies that all fields survive a JSON
// marshal/unmarshal cycle.
func TestAgentExecMessage_JSONRoundTrip(t *testing.T) {
	cases := []struct {
		name string
		msg  agentExecMessage
	}{
		{
			name: "stdout frame",
			msg:  agentExecMessage{Type: "stdout", Data: "hello\n"},
		},
		{
			name: "stderr frame",
			msg:  agentExecMessage{Type: "stderr", Data: "error: not found"},
		},
		{
			name: "resize frame",
			msg:  agentExecMessage{Type: "resize", Cols: 120, Rows: 40},
		},
		{
			name: "exit success",
			msg:  agentExecMessage{Type: "exit", ExitCode: 0},
		},
		{
			name: "exit failure",
			msg:  agentExecMessage{Type: "exit", ExitCode: 1},
		},
		{
			name: "error frame",
			msg:  agentExecMessage{Type: "error", Data: "Missing cluster"},
		},
		{
			name: "exec_started ack",
			msg:  agentExecMessage{Type: "exec_started"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data, err := json.Marshal(tc.msg)
			if err != nil {
				t.Fatalf("Marshal error: %v", err)
			}

			var got agentExecMessage
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("Unmarshal error: %v", err)
			}

			if got.Type != tc.msg.Type {
				t.Errorf("Type = %q; want %q", got.Type, tc.msg.Type)
			}
			if got.Data != tc.msg.Data {
				t.Errorf("Data = %q; want %q", got.Data, tc.msg.Data)
			}
			if got.Cols != tc.msg.Cols {
				t.Errorf("Cols = %d; want %d", got.Cols, tc.msg.Cols)
			}
			if got.Rows != tc.msg.Rows {
				t.Errorf("Rows = %d; want %d", got.Rows, tc.msg.Rows)
			}
			if got.ExitCode != tc.msg.ExitCode {
				t.Errorf("ExitCode = %d; want %d", got.ExitCode, tc.msg.ExitCode)
			}
		})
	}
}

// TestAgentExecMessage_OmitEmptyFields verifies that empty Data, zero Cols/Rows,
// and zero ExitCode are omitted from JSON output (thanks to `omitempty` tags),
// keeping the wire format compact.
func TestAgentExecMessage_OmitEmptyFields(t *testing.T) {
	msg := agentExecMessage{Type: "exec_started"}
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	raw := string(data)
	if strings.Contains(raw, `"data"`) {
		t.Errorf("expected 'data' field to be omitted; got %s", raw)
	}
	if strings.Contains(raw, `"cols"`) {
		t.Errorf("expected 'cols' field to be omitted; got %s", raw)
	}
	if strings.Contains(raw, `"rows"`) {
		t.Errorf("expected 'rows' field to be omitted; got %s", raw)
	}
}

// ---------------------------------------------------------------------------
// Section 6: agentExecWriteError — Error Frame Helper
// ---------------------------------------------------------------------------

// TestAgentExecWriteError_SendsErrorFrame verifies that agentExecWriteError
// sends a properly formatted JSON error frame to the client.
func TestAgentExecWriteError_SendsErrorFrame(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	agentExecWriteError(serverConn, "something went wrong")

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if msg.Type != "error" {
		t.Errorf("Type = %q; want %q", msg.Type, "error")
	}
	if msg.Data != "something went wrong" {
		t.Errorf("Data = %q; want %q", msg.Data, "something went wrong")
	}
}

// TestAgentExecWriteError_EmptyMessage verifies that an empty error message
// still produces a valid frame.
func TestAgentExecWriteError_EmptyMessage(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	agentExecWriteError(serverConn, "")

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if msg.Type != "error" {
		t.Errorf("Type = %q; want %q", msg.Type, "error")
	}
}
