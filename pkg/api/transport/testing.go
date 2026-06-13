package transport

import "sync/atomic"

// TestRegisterClient sends a client to the Hub's register channel for testing.
// This allows tests outside the transport package to register clients without
// accessing the unexported register field.
func (h *Hub) TestRegisterClient(client *Client) {
	atomic.AddInt64(&h.activeConns, 1)
	h.register <- client
}

// TestUnregisterClient sends a client to the Hub's unregister channel for testing.
// This allows tests outside the transport package to unregister clients without
// accessing the unexported unregister field.
func (h *Hub) TestUnregisterClient(client *Client) {
	h.unregister <- client
}

// TestGetActiveConns returns the current activeConns counter value for testing.
func (h *Hub) TestGetActiveConns() int64 {
	return atomic.LoadInt64(&h.activeConns)
}

// TestGetDoneChan returns the done channel for testing shutdown behavior.
func (h *Hub) TestGetDoneChan() <-chan struct{} {
	return h.done
}

// TestGetRegisterChan returns the register channel for testing registration patterns.
func (h *Hub) TestGetRegisterChan() chan<- *Client {
	return h.register
}
