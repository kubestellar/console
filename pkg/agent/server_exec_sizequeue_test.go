package agent

import (
	"k8s.io/client-go/tools/remotecommand"
	"testing"
)

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
