package handlers

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestHubBroadcastAfterClose verifies Broadcast does not block after the hub
// has been shut down (#6479). The Run loop stops draining `broadcast` once
// done is closed, so a naive blocking send would hang the caller forever.
func TestHubBroadcastAfterClose(t *testing.T) {
	h := NewHub()
	// Note: we intentionally do NOT call h.Run() so the broadcast channel
	// will never be drained. Closing the hub is what should prevent Broadcast
	// from blocking.
	h.Close()

	done := make(chan struct{})
	go func() {
		// This call should return promptly via the `case <-h.done` arm.
		h.Broadcast(uuid.New(), Message{Type: "test", Data: "payload"})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Broadcast blocked after hub Close() — #6479 regression")
	}
}

// TestHubRegisterChannelsAbortOnClose simulates the WebSocket
// register/unregister send paths used by HandleConnection. The fix for #6479
// wraps those sends in a select with `case <-h.done`; this test asserts that
// pattern returns within a bounded time instead of leaking the goroutine.
func TestHubRegisterChannelsAbortOnClose(t *testing.T) {
	h := NewHub()
	h.Close()

	// Simulate the register send from HandleConnection.
	client := &Client{userID: uuid.Nil, send: make(chan []byte, 1)}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case h.register <- client:
		case <-h.done:
		}
	}()

	waitCh := make(chan struct{})
	go func() { wg.Wait(); close(waitCh) }()
	select {
	case <-waitCh:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("register send pattern blocked after hub Close() — #6479 regression")
	}
}
