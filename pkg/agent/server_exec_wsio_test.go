package agent

import (
	"encoding/json"
	"io"
	"sync"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Section 2: agentWSWriter — Stdout/Stderr Framing
// ---------------------------------------------------------------------------

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
