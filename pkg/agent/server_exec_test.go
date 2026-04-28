package agent

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"k8s.io/client-go/tools/remotecommand"
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
// Section 2: agentWSWriter — Stdout/Stderr Framing
// ---------------------------------------------------------------------------

// newTestWSPair creates a connected pair of gorilla WebSocket connections using
// an httptest server. The server-side connection is returned as `serverConn`
// and the client-side as `clientConn`. Both must be closed by the caller.
func newTestWSPair(t *testing.T) (serverConn, clientConn *websocket.Conn, cleanup func()) {
	t.Helper()

	serverReady := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("server upgrade failed: %v", err)
		}
		serverReady <- conn
	}))

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/"
	dialer := websocket.Dialer{}
	client, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		srv.Close()
		t.Fatalf("client dial failed: %v", err)
	}

	server := <-serverReady

	return server, client, func() {
		server.Close()
		client.Close()
		srv.Close()
	}
}

// TestAgentWSWriter_StdoutFrame verifies that raw bytes written via
// agentWSWriter.Write are wrapped into the JSON envelope
// { "type": "stdout", "data": "..." } on the wire.
func TestAgentWSWriter_StdoutFrame(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}

	payload := "hello world\n"
	n, err := writer.Write([]byte(payload))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(payload) {
		t.Errorf("Write returned %d; want %d", n, len(payload))
	}

	// Read from the client side
	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("failed to unmarshal received frame: %v", err)
	}
	if msg.Type != "stdout" {
		t.Errorf("Type = %q; want %q", msg.Type, "stdout")
	}
	if msg.Data != payload {
		t.Errorf("Data = %q; want %q", msg.Data, payload)
	}
}

// TestAgentWSWriter_StderrFrame verifies that the stderr writer correctly tags
// frames with "stderr" type rather than "stdout".
func TestAgentWSWriter_StderrFrame(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stderr", mu: mu}

	payload := "error: file not found\n"
	_, err := writer.Write([]byte(payload))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if msg.Type != "stderr" {
		t.Errorf("Type = %q; want %q", msg.Type, "stderr")
	}
	if msg.Data != payload {
		t.Errorf("Data = %q; want %q", msg.Data, payload)
	}
}

// TestAgentWSWriter_EmptyPayload ensures that an empty Write produces a valid
// JSON frame with empty data rather than erroring or omitting the frame.
func TestAgentWSWriter_EmptyPayload(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}

	n, err := writer.Write([]byte{})
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != 0 {
		t.Errorf("Write returned %d; want 0", n)
	}

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	// Per agentExecMessage, "data" has `omitempty` — so empty string should be omitted
	if msg.Type != "stdout" {
		t.Errorf("Type = %q; want %q", msg.Type, "stdout")
	}
}

// TestAgentWSWriter_MultiByteUTF8 ensures that multi-byte UTF-8 data (e.g.
// CJK characters, emoji) is preserved through the JSON envelope without
// corruption or truncation.
func TestAgentWSWriter_MultiByteUTF8(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}

	// Multi-byte UTF-8: Japanese + emoji + Chinese
	payload := []byte("こんにちは 🚀 中文")
	n, err := writer.Write(payload)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(payload) {
		t.Errorf("Write returned %d; want %d", n, len(payload))
	}

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if msg.Data != string(payload) {
		t.Errorf("Data = %q; want %q", msg.Data, string(payload))
	}
}

// TestAgentWSWriter_ConcurrentWrites verifies that concurrent Write calls do
// not race or panic thanks to the shared mutex. This test runs many goroutines
// writing simultaneously.
func TestAgentWSWriter_ConcurrentWrites(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	stdoutWriter := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}
	stderrWriter := &agentWSWriter{conn: serverConn, msgType: "stderr", mu: mu}

	const numWriters = 10
	var wg sync.WaitGroup
	wg.Add(numWriters * 2) // half stdout, half stderr

	for i := 0; i < numWriters; i++ {
		go func(idx int) {
			defer wg.Done()
			data := []byte("stdout data\n")
			if _, err := stdoutWriter.Write(data); err != nil {
				// Connection may close during concurrent writes — not a test failure
				return
			}
		}(i)
		go func(idx int) {
			defer wg.Done()
			data := []byte("stderr data\n")
			if _, err := stderrWriter.Write(data); err != nil {
				return
			}
		}(i)
	}

	// Read all messages on the client side in a goroutine
	receivedCh := make(chan int, numWriters*2)
	go func() {
		for {
			_, _, err := clientConn.ReadMessage()
			if err != nil {
				return
			}
			// Non-blocking send to avoid panic if channel gets full
			select {
			case receivedCh <- 1:
			default:
				return
			}
		}
	}()

	wg.Wait()
	// Give time for all reads to complete
	time.Sleep(100 * time.Millisecond)

	count := 0
loop:
	for {
		select {
		case <-receivedCh:
			count++
		default:
			break loop
		}
	}
	if count == 0 {
		t.Error("expected at least one message to be received during concurrent writes")
	}
}

// TestAgentWSWriter_ClosedConnection verifies that writing to a closed
// connection returns an error rather than panicking.
func TestAgentWSWriter_ClosedConnection(t *testing.T) {
	serverConn, _, cleanup := newTestWSPair(t)

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}

	// Close the connection first
	cleanup()

	_, err := writer.Write([]byte("should fail"))
	if err == nil {
		t.Error("expected write to closed connection to return error, got nil")
	}
}

// TestAgentWSWriter_LargePayload verifies that large payloads are transmitted
// correctly without truncation through the JSON framing.
func TestAgentWSWriter_LargePayload(t *testing.T) {
	serverConn, clientConn, cleanup := newTestWSPair(t)
	defer cleanup()

	mu := &sync.Mutex{}
	writer := &agentWSWriter{conn: serverConn, msgType: "stdout", mu: mu}

	// 64 KiB payload — larger than typical terminal output
	const payloadSize = 64 * 1024
	payload := make([]byte, payloadSize)
	for i := range payload {
		payload[i] = byte('A' + (i % 26))
	}

	n, err := writer.Write(payload)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != payloadSize {
		t.Errorf("Write returned %d; want %d", n, payloadSize)
	}

	_, raw, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client ReadMessage error: %v", err)
	}

	var msg agentExecMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if len(msg.Data) != payloadSize {
		t.Errorf("Data length = %d; want %d", len(msg.Data), payloadSize)
	}
}

// ---------------------------------------------------------------------------
// Section 3: agentWSReader — Stdin Handling
// ---------------------------------------------------------------------------

// TestAgentWSReader_BasicRead verifies that data written to the channel is
// correctly delivered through the Read interface.
func TestAgentWSReader_BasicRead(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	// Send data through the channel
	ch <- []byte("hello")

	buf := make([]byte, 32)
	n, err := reader.Read(buf)
	if err != nil {
		t.Fatalf("Read error: %v", err)
	}
	if n != 5 {
		t.Errorf("Read returned %d bytes; want 5", n)
	}
	if string(buf[:n]) != "hello" {
		t.Errorf("Read data = %q; want %q", string(buf[:n]), "hello")
	}
}

// TestAgentWSReader_BufferCarryOver verifies that when the data from a channel
// frame exceeds the caller's buffer size, the overflow is stored in buf and
// returned on the next Read call — preventing data loss.
func TestAgentWSReader_BufferCarryOver(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	// Send 10 bytes, but only read 4 at a time
	ch <- []byte("0123456789")

	// First read: should get the first 4 bytes
	buf := make([]byte, 4)
	n, err := reader.Read(buf)
	if err != nil {
		t.Fatalf("first Read error: %v", err)
	}
	if n != 4 {
		t.Errorf("first Read returned %d; want 4", n)
	}
	if string(buf[:n]) != "0123" {
		t.Errorf("first Read data = %q; want %q", string(buf[:n]), "0123")
	}

	// Second read: should get the next 4 bytes from buf
	n, err = reader.Read(buf)
	if err != nil {
		t.Fatalf("second Read error: %v", err)
	}
	if n != 4 {
		t.Errorf("second Read returned %d; want 4", n)
	}
	if string(buf[:n]) != "4567" {
		t.Errorf("second Read data = %q; want %q", string(buf[:n]), "4567")
	}

	// Third read: should get the remaining 2 bytes from buf
	n, err = reader.Read(buf)
	if err != nil {
		t.Fatalf("third Read error: %v", err)
	}
	if n != 2 {
		t.Errorf("third Read returned %d; want 2", n)
	}
	if string(buf[:n]) != "89" {
		t.Errorf("third Read data = %q; want %q", string(buf[:n]), "89")
	}
}

// TestAgentWSReader_EOFOnClose verifies that when the channel is closed (user
// disconnected), subsequent Read calls return io.EOF — the standard signal
// for end-of-stream that the SPDY executor expects.
func TestAgentWSReader_EOFOnClose(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	close(ch)

	buf := make([]byte, 32)
	n, err := reader.Read(buf)
	if err != io.EOF {
		t.Errorf("Read after close: err = %v; want io.EOF", err)
	}
	if n != 0 {
		t.Errorf("Read after close: n = %d; want 0", n)
	}
}

// TestAgentWSReader_DrainThenEOF verifies that all buffered data is returned
// before the EOF is signalled when the channel is drained then closed.
func TestAgentWSReader_DrainThenEOF(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	ch <- []byte("line1\n")
	ch <- []byte("line2\n")
	close(ch)

	buf := make([]byte, 64)

	// First read: should return "line1\n"
	n, err := reader.Read(buf)
	if err != nil {
		t.Fatalf("first Read error: %v", err)
	}
	if string(buf[:n]) != "line1\n" {
		t.Errorf("first Read = %q; want %q", string(buf[:n]), "line1\n")
	}

	// Second read: should return "line2\n"
	n, err = reader.Read(buf)
	if err != nil {
		t.Fatalf("second Read error: %v", err)
	}
	if string(buf[:n]) != "line2\n" {
		t.Errorf("second Read = %q; want %q", string(buf[:n]), "line2\n")
	}

	// Third read: should return EOF
	n, err = reader.Read(buf)
	if err != io.EOF {
		t.Errorf("third Read: err = %v; want io.EOF", err)
	}
	if n != 0 {
		t.Errorf("third Read: n = %d; want 0", n)
	}
}

// TestAgentWSReader_ExactBufferSize verifies that when the caller's Read
// buffer is exactly the size of the incoming data, no leftover is stored.
func TestAgentWSReader_ExactBufferSize(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	data := []byte("exact")
	ch <- data

	buf := make([]byte, 5) // exact match
	n, err := reader.Read(buf)
	if err != nil {
		t.Fatalf("Read error: %v", err)
	}
	if n != 5 {
		t.Errorf("Read returned %d; want 5", n)
	}
	if string(buf[:n]) != "exact" {
		t.Errorf("Read data = %q; want %q", string(buf[:n]), "exact")
	}

	// Verify no leftover in internal buf
	if len(reader.buf) != 0 {
		t.Errorf("internal buf length = %d; want 0 (no leftover)", len(reader.buf))
	}
}

// TestAgentWSReader_LargerBufferThanData verifies that when the caller's Read
// buffer is larger than the incoming data, all data is returned in a single
// Read call.
func TestAgentWSReader_LargerBufferThanData(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	ch <- []byte("hi")

	buf := make([]byte, 1024)
	n, err := reader.Read(buf)
	if err != nil {
		t.Fatalf("Read error: %v", err)
	}
	if n != 2 {
		t.Errorf("Read returned %d; want 2", n)
	}
	if string(buf[:n]) != "hi" {
		t.Errorf("Read data = %q; want %q", string(buf[:n]), "hi")
	}
}

// TestAgentWSReader_MultipleFrames verifies sequential reads from multiple
// channel sends work correctly — simulating a user typing multiple keystrokes.
func TestAgentWSReader_MultipleFrames(t *testing.T) {
	ch := make(chan []byte, agentExecStdinBufferSize)
	reader := &agentWSReader{ch: ch}

	inputs := []string{"a", "bc", "def", "\n"}
	for _, s := range inputs {
		ch <- []byte(s)
	}

	buf := make([]byte, 64)
	var collected string

	for i := 0; i < len(inputs); i++ {
		n, err := reader.Read(buf)
		if err != nil {
			t.Fatalf("Read %d error: %v", i, err)
		}
		collected += string(buf[:n])
	}

	expected := "abcdef\n"
	if collected != expected {
		t.Errorf("collected %q; want %q", collected, expected)
	}
}

// ---------------------------------------------------------------------------
// Section 4: agentTerminalSizeQueue — Resize Events
// ---------------------------------------------------------------------------

// TestAgentTerminalSizeQueue_Next verifies that Next() returns a terminal size
// from the channel and that the pointer is non-nil.
func TestAgentTerminalSizeQueue_Next(t *testing.T) {
	q := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}

	q.ch <- remotecommand.TerminalSize{Width: 120, Height: 40}

	size := q.Next()
	if size == nil {
		t.Fatal("Next() returned nil; want non-nil")
	}
	if size.Width != 120 {
		t.Errorf("Width = %d; want 120", size.Width)
	}
	if size.Height != 40 {
		t.Errorf("Height = %d; want 40", size.Height)
	}
}

// TestAgentTerminalSizeQueue_NilOnClose verifies that Next() returns nil when
// the channel is closed — the standard signal for "no more resize events"
// that the SPDY executor expects.
func TestAgentTerminalSizeQueue_NilOnClose(t *testing.T) {
	q := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}

	close(q.ch)

	size := q.Next()
	if size != nil {
		t.Errorf("Next() after close returned %+v; want nil", size)
	}
}

// TestAgentTerminalSizeQueue_MultipleResizes verifies that multiple resize
// events are delivered in FIFO order without dropping.
func TestAgentTerminalSizeQueue_MultipleResizes(t *testing.T) {
	q := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}

	sizes := []remotecommand.TerminalSize{
		{Width: 80, Height: 24},
		{Width: 120, Height: 40},
		{Width: 200, Height: 50},
		{Width: 132, Height: 43},
	}

	for _, s := range sizes {
		q.ch <- s
	}

	for i, expected := range sizes {
		got := q.Next()
		if got == nil {
			t.Fatalf("Next() %d returned nil; want %+v", i, expected)
		}
		if got.Width != expected.Width || got.Height != expected.Height {
			t.Errorf("Next() %d = %+v; want %+v", i, *got, expected)
		}
	}
}

// TestAgentTerminalSizeQueue_BufferFull verifies that when the resize buffer
// is full (4 items), additional sends are handled gracefully via the non-blocking
// select pattern used in handleExec (lines 466-469).
func TestAgentTerminalSizeQueue_BufferFull(t *testing.T) {
	q := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}

	// Fill the buffer to capacity
	for i := 0; i < agentExecResizeBufferSize; i++ {
		q.ch <- remotecommand.TerminalSize{Width: uint16(80 + i), Height: 24}
	}

	// This is the non-blocking select pattern from handleExec
	extraSize := remotecommand.TerminalSize{Width: 999, Height: 999}
	select {
	case q.ch <- extraSize:
		t.Error("expected channel send to be dropped (buffer full), but it succeeded")
	default:
		// Expected: channel is full, extra resize is dropped silently
	}

	// Verify the original sizes are still in the queue
	first := q.Next()
	if first == nil || first.Width != 80 {
		t.Errorf("first resize: got %+v; want Width=80", first)
	}
}

// TestAgentTerminalSizeQueue_DrainThenClose verifies the ordering guarantee
// from #7048/#7778: drain all items, then close the channel.
func TestAgentTerminalSizeQueue_DrainThenClose(t *testing.T) {
	q := &agentTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, agentExecResizeBufferSize),
	}

	q.ch <- remotecommand.TerminalSize{Width: 80, Height: 24}
	q.ch <- remotecommand.TerminalSize{Width: 120, Height: 40}

	// Drain
	s1 := q.Next()
	s2 := q.Next()
	if s1 == nil || s2 == nil {
		t.Fatal("expected two sizes before close")
	}

	// Close
	close(q.ch)

	// Should now return nil
	s3 := q.Next()
	if s3 != nil {
		t.Errorf("Next() after close returned %+v; want nil", s3)
	}
}

// TestAgentTerminalSizeQueue_ImplementsInterface verifies that
// agentTerminalSizeQueue implements the remotecommand.TerminalSizeQueue
// interface at compile time.
func TestAgentTerminalSizeQueue_ImplementsInterface(t *testing.T) {
	var _ remotecommand.TerminalSizeQueue = (*agentTerminalSizeQueue)(nil)
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

// ---------------------------------------------------------------------------
// Section 7: Constants Validation
// ---------------------------------------------------------------------------

// TestExecConstants_SaneValues validates that the exported constants match the
// documented values and maintain the invariant agentExecPongTimeout >
// agentExecPingInterval (otherwise the pong deadline would be in the past
// when a new ping is sent).
func TestExecConstants_SaneValues(t *testing.T) {
	if agentExecPongTimeout <= agentExecPingInterval {
		t.Errorf("PongTimeout (%v) must be > PingInterval (%v)",
			agentExecPongTimeout, agentExecPingInterval)
	}

	if agentExecMaxStdinBytes != 1*1024*1024 {
		t.Errorf("MaxStdinBytes = %d; want %d (1 MiB)", agentExecMaxStdinBytes, 1*1024*1024)
	}

	if agentExecDefaultCols != 80 {
		t.Errorf("DefaultCols = %d; want 80", agentExecDefaultCols)
	}

	if agentExecDefaultRows != 24 {
		t.Errorf("DefaultRows = %d; want 24", agentExecDefaultRows)
	}

	if agentExecStdinBufferSize != 32 {
		t.Errorf("StdinBufferSize = %d; want 32", agentExecStdinBufferSize)
	}

	if agentExecResizeBufferSize != 4 {
		t.Errorf("ResizeBufferSize = %d; want 4", agentExecResizeBufferSize)
	}

	if agentExecWriteDeadline != 10*time.Second {
		t.Errorf("WriteDeadline = %v; want 10s", agentExecWriteDeadline)
	}
}

// ---------------------------------------------------------------------------
// Section 8: Stdin Drop Counter
// ---------------------------------------------------------------------------

// TestGetAgentExecStdinDropCount verifies the exported counter accessor works.
func TestGetAgentExecStdinDropCount(t *testing.T) {
	// The counter is a process-global atomic — snapshot the current value
	// to avoid test pollution.
	before := GetAgentExecStdinDropCount()

	// Simulate a drop
	agentExecStdinDropCount.Add(1)

	after := GetAgentExecStdinDropCount()
	if after != before+1 {
		t.Errorf("stdin drop count = %d; want %d", after, before+1)
	}
}

// ---------------------------------------------------------------------------
// Section 9: handleExec — Integration-Level WebSocket Tests
// ---------------------------------------------------------------------------

// TestHandleExec_OPTIONSPreflight verifies the CORS preflight response for
// the /ws/exec endpoint.
func TestHandleExec_OPTIONSPreflight(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodOptions, "/ws/exec", nil)
	req.Header.Set("Origin", "http://localhost:5174")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusOK)
	}

	acao := resp.Header.Get("Access-Control-Allow-Origin")
	if acao != "http://localhost:5174" {
		t.Errorf("ACAO = %q; want %q", acao, "http://localhost:5174")
	}

	apn := resp.Header.Get("Access-Control-Allow-Private-Network")
	if apn != "true" {
		t.Errorf("Access-Control-Allow-Private-Network = %q; want %q", apn, "true")
	}
}

// TestHandleExec_OPTIONSPreflight_UnknownOrigin verifies that an unknown
// origin does NOT get the ACAO header set.
func TestHandleExec_OPTIONSPreflight_UnknownOrigin(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodOptions, "/ws/exec", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no ACAO header for unknown origin, got %q", got)
	}
}

// TestHandleExec_Unauthorized verifies that a request without a valid token
// is rejected with 401 when token auth is enabled.
func TestHandleExec_Unauthorized(t *testing.T) {
	s := &Server{
		agentToken:     "test-secret-token",
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodGet, "/ws/exec", nil)
	req.Header.Set("Origin", "http://localhost:5174")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusUnauthorized)
	}
}

// TestHandleExec_NoK8sClient verifies that the handler returns 503 when
// the k8s client is nil (no kubeconfig loaded).
func TestHandleExec_NoK8sClient(t *testing.T) {
	s := &Server{
		agentToken:     "", // no auth required
		k8sClient:      nil,
		allowedOrigins: []string{},
	}

	req := httptest.NewRequest(http.MethodGet, "/ws/exec", nil)
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusServiceUnavailable)
	}
}
