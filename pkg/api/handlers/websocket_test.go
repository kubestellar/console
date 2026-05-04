package handlers

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"


	fasthttpws "github.com/fasthttp/websocket"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupWSServer creates a real fiber websocket listener for tests that need a valid *websocket.Conn
func setupWSServer(t *testing.T, extractConn func(c *websocket.Conn)) (*fiber.App, string) {
	app := fiber.New(fiber.Config{DisableStartupMessage: true})

	app.Use("/ws", func(c *fiber.Ctx) error {
		if c.Get("Upgrade") != "websocket" {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	})

	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		extractConn(c)
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				break
			}
		}
	}))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	go func() {
		_ = app.Listener(ln)
	}()

	t.Cleanup(func() {
		app.Shutdown()
	})

	return app, fmt.Sprintf("ws://%s/ws", ln.Addr().String())
}

// 1. Hub Registration: Test the Hub to ensure clients are correctly indexed by userID
// upon connection and removed immediately on disconnection to prevent memory leaks.
func TestHubRegistration(t *testing.T) {
	h := NewHub()
	go h.Run()
	defer h.Close()

	userID := uuid.New()
	client := &Client{
		userID: userID,
		send:   make(chan []byte, 256),
	}

	// Simulate what HandleConnection does: pre-increment activeConns before registering
	atomic.AddInt64(&h.activeConns, 1)
	h.register <- client
	time.Sleep(50 * time.Millisecond)

	assert.Equal(t, 1, h.GetActiveUsersCount())
	assert.Equal(t, 1, h.GetTotalConnectionsCount())

	h.unregister <- client
	time.Sleep(50 * time.Millisecond)

	assert.Equal(t, 0, h.GetActiveUsersCount())
	assert.Equal(t, 0, h.GetTotalConnectionsCount())
}

// 2. Non-blocking Broadcasts: Verify that h.Broadcast does not block the entire server 
func TestHubNonBlockingBroadcast(t *testing.T) {
	// 2a. Test h.Broadcast returning immediately when h.broadcast is full
	h := NewHub()
	// Do NOT run h.Run() so h.broadcast won't drain

	userID := uuid.New()
	msg := Message{Type: "test", Data: "test"}

	// h.broadcast chan capacity is 256
	for i := 0; i < 256; i++ {
		h.Broadcast(userID, msg)
	}

	done := make(chan struct{})
	go func() {
		h.Broadcast(userID, msg) // 257th message should drop, not block
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("h.Broadcast blocked when h.broadcast channel was full")
	}
}

func TestHubSlowClientDisconnect(t *testing.T) {
	// 2b. Test that a slow client (buffer full) disconnects without blocking the Run loop
	var serverConn *websocket.Conn
	var serverNetConn net.Conn // #9736 — capture inside handler to avoid releaseConn race
	var connReady sync.WaitGroup
	connReady.Add(1)

	_, wsURL := setupWSServer(t, func(c *websocket.Conn) {
		serverConn = c
		serverNetConn = c.NetConn()
		connReady.Done()
	})

	clientConn, _, err := fasthttpws.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer clientConn.Close()

	connReady.Wait()

	h := NewHub()
	go h.Run()
	defer h.Close()

	userID := uuid.New()

	client := &Client{
		conn:    serverConn,
		netConn: serverNetConn,
		userID:  userID,
		send:    make(chan []byte, 1), // small buffer
	}

	// Simulate what HandleConnection does: pre-increment activeConns before registering
	atomic.AddInt64(&h.activeConns, 1)
	h.register <- client
	time.Sleep(50 * time.Millisecond)

	// Fill the client buffer (capacity 1) and cause overflow
	h.Broadcast(userID, Message{Type: "test", Data: "msg1"})
	h.Broadcast(userID, Message{Type: "test", Data: "msg2"})
	h.Broadcast(userID, Message{Type: "test", Data: "msg3"})

	time.Sleep(100 * time.Millisecond)

	// Slow client should be disconnected and unregistered
	assert.Equal(t, 0, h.GetTotalConnectionsCount())
}

// 3. Thread-Safe Closing: Stress-test client.closeConn() with multiple concurrent calls
func TestClientThreadSafeClosing(t *testing.T) {
	var serverConn *websocket.Conn
	var serverNetConn net.Conn // #9736 — capture inside handler to avoid releaseConn race
	var connReady sync.WaitGroup
	connReady.Add(1)

	_, wsURL := setupWSServer(t, func(c *websocket.Conn) {
		serverConn = c
		serverNetConn = c.NetConn()
		connReady.Done()
	})

	clientConn, _, err := fasthttpws.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer clientConn.Close()

	connReady.Wait()

	client := &Client{
		conn:    serverConn,
		netConn: serverNetConn,
		userID:  uuid.New(),
		send:    make(chan []byte, 256),
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.closeConn()
		}()
	}

	wg.Wait()
	// Test passes if no panic occurs (closeOnce guards the underlying closure)
}

// 4. Session Limits: Test the WS_MAX_CONNECTIONS enforcement
func TestSessionLimits(t *testing.T) {
	os.Setenv("WS_MAX_CONNECTIONS", "2")
	defer os.Unsetenv("WS_MAX_CONNECTIONS")

	h := NewHub()
	h.SetDevMode(true)

	go h.Run()
	defer h.Close()

	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Use("/ws", func(c *fiber.Ctx) error {
		if c.Get("Upgrade") != "websocket" {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	})
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		h.HandleConnection(c)
	}))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	go func() {
		_ = app.Listener(ln)
	}()
	defer app.Shutdown()

	wsURL := fmt.Sprintf("ws://%s/ws", ln.Addr().String())

	dialAndAuth := func() (*fasthttpws.Conn, error) {
		conn, _, err := fasthttpws.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			return nil, err
		}

		authMsg := struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}{
			Type:  "auth",
			Token: "demo-token",
		}
		data, _ := json.Marshal(authMsg)
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return conn, err
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			return conn, err
		}

		var resp Message
		json.Unmarshal(msg, &resp)
		if resp.Type == "error" {
			return conn, fmt.Errorf("server error: %v", resp.Data)
		}

		// The server sends "authenticated" and then immediately checks limits.
		// If limits are exceeded, it sends "error" and closes.
		// So we do a non-blocking short read to see if an error follows.
		conn.UnderlyingConn().SetReadDeadline(time.Now().Add(50 * time.Millisecond))
		_, msg2, err2 := conn.ReadMessage()
		conn.UnderlyingConn().SetReadDeadline(time.Time{}) // Reset 
		if err2 == nil {
			var resp2 Message
			json.Unmarshal(msg2, &resp2)
			if resp2.Type == "error" {
				return conn, fmt.Errorf("server error: %v", resp2.Data)
			}
		}
		
		return conn, nil
	}

	conn1, err := dialAndAuth()
	require.NoError(t, err)
	defer conn1.Close()

	conn2, err := dialAndAuth()
	require.NoError(t, err)
	defer conn2.Close()

	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 2, h.GetTotalConnectionsCount())

	conn3, err := dialAndAuth()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "server at capacity")
	if conn3 != nil {
		conn3.Close()
	}
}
