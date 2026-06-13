package transport

import (
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// SSECacheGet / SSECacheSet / ClearSSECache — all were 0%
// ────────────────────────────────────────────────────────────────────────────

func resetSSECache(t *testing.T) {
	t.Helper()
	sseCacheMu.Lock()
	sseCache = make(map[string]*sseCacheEntry)
	sseCacheMu.Unlock()
}

func TestSSECacheGet_Miss(t *testing.T) {
	resetSSECache(t)
	result := SSECacheGet("nonexistent-key")
	assert.Nil(t, result)
}

func TestSSECacheSet_ThenGet(t *testing.T) {
	resetSSECache(t)
	SSECacheSet("pods-list", []string{"pod-a", "pod-b"})

	result := SSECacheGet("pods-list")
	require.NotNil(t, result)
	assert.Equal(t, []string{"pod-a", "pod-b"}, result)
}

func TestSSECacheGet_Expired(t *testing.T) {
	resetSSECache(t)
	// Insert an entry with a past timestamp
	sseCacheMu.Lock()
	sseCache["old-key"] = &sseCacheEntry{
		data:      "stale-data",
		fetchedAt: time.Now().Add(-sseCacheTTL - time.Second),
	}
	sseCacheMu.Unlock()

	result := SSECacheGet("old-key")
	assert.Nil(t, result, "expired entry should return nil")
}

func TestSSECacheSet_Overwrites(t *testing.T) {
	resetSSECache(t)
	SSECacheSet("key", "first")
	SSECacheSet("key", "second")

	result := SSECacheGet("key")
	assert.Equal(t, "second", result)
}

func TestClearSSECache_RemovesAll(t *testing.T) {
	resetSSECache(t)
	SSECacheSet("a", 1)
	SSECacheSet("b", 2)

	ClearSSECache()

	assert.Nil(t, SSECacheGet("a"))
	assert.Nil(t, SSECacheGet("b"))
}

func TestSSECacheGet_ConcurrentSafe(t *testing.T) {
	resetSSECache(t)
	SSECacheSet("concurrent-key", "value")

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = SSECacheGet("concurrent-key")
		}()
	}
	wg.Wait()
}

// ────────────────────────────────────────────────────────────────────────────
// StopSSECacheEvictor — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestStopSSECacheEvictor_DoubleCallSafe(t *testing.T) {
	// Reset the channel for this test
	origDone := sseCacheEvictDone
	sseCacheEvictDone = make(chan struct{})
	defer func() { sseCacheEvictDone = origDone }()

	// First call should close
	StopSSECacheEvictor()
	// Second call should not panic
	StopSSECacheEvictor()
}

// ────────────────────────────────────────────────────────────────────────────
// Hub.RecordDemoSession — was 0%
// ────────────────────────────────────────────────────────────────────────────

func newTestHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]bool),
		userIndex:      make(map[uuid.UUID][]*Client),
		demoSessions:   make(map[string]time.Time),
		broadcast:      make(chan broadcastMessage, 256),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		done:           make(chan struct{}),
		maxConnections: 100,
	}
}

func TestRecordDemoSession_NewSession(t *testing.T) {
	h := newTestHub()
	ok := h.RecordDemoSession("session-abc")
	assert.True(t, ok)
}

func TestRecordDemoSession_UpdateExisting(t *testing.T) {
	h := newTestHub()
	h.RecordDemoSession("sess-1")
	// Update should succeed
	ok := h.RecordDemoSession("sess-1")
	assert.True(t, ok)
}

func TestRecordDemoSession_RejectsOversizedID(t *testing.T) {
	h := newTestHub()
	longID := strings.Repeat("x", maxSessionIDLen+1)
	ok := h.RecordDemoSession(longID)
	assert.False(t, ok)
}

func TestRecordDemoSession_MaxLengthID(t *testing.T) {
	h := newTestHub()
	exactID := strings.Repeat("y", maxSessionIDLen)
	ok := h.RecordDemoSession(exactID)
	assert.True(t, ok)
}

func TestRecordDemoSession_EvictsStale(t *testing.T) {
	h := newTestHub()
	// Fill with stale sessions
	staleTime := time.Now().Add(-wsInactiveCutoff - time.Second)
	for i := 0; i < maxDemoSessions; i++ {
		h.demoSessions[strings.Repeat("s", i+1)] = staleTime
	}

	// New session should succeed after eviction
	ok := h.RecordDemoSession("fresh-session")
	assert.True(t, ok)
}

func TestRecordDemoSession_RejectsAtCapacity(t *testing.T) {
	h := newTestHub()
	// Fill with active sessions
	now := time.Now()
	for i := 0; i < maxDemoSessions; i++ {
		h.demoSessions[strings.Repeat("a", i+1)] = now
	}

	// Should reject new session
	ok := h.RecordDemoSession("one-too-many")
	assert.False(t, ok)
}

// ────────────────────────────────────────────────────────────────────────────
// Hub.GetDemoSessionCount — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestGetDemoSessionCount_Empty(t *testing.T) {
	h := newTestHub()
	assert.Equal(t, 0, h.GetDemoSessionCount())
}

func TestGetDemoSessionCount_ActiveOnly(t *testing.T) {
	h := newTestHub()
	now := time.Now()
	h.demoSessions["active-1"] = now
	h.demoSessions["active-2"] = now
	h.demoSessions["stale"] = now.Add(-wsInactiveCutoff - time.Second)

	assert.Equal(t, 2, h.GetDemoSessionCount())
}

// ────────────────────────────────────────────────────────────────────────────
// Hub.SetJWTSecret — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestSetJWTSecret_Stores(t *testing.T) {
	h := newTestHub()
	h.SetJWTSecret("my-secret-key")

	h.configMu.RLock()
	defer h.configMu.RUnlock()
	assert.Equal(t, "my-secret-key", h.jwtSecret)
}

// ────────────────────────────────────────────────────────────────────────────
// Hub.BroadcastAll — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestBroadcastAll_ClosedHub(t *testing.T) {
	h := newTestHub()
	close(h.done) // simulate closed hub

	// Should not panic
	h.BroadcastAll(Message{Type: "test", Data: "hello"})
}

func TestBroadcastAll_SendsToClients(t *testing.T) {
	h := newTestHub()
	client := &Client{
		send: make(chan []byte, 10),
	}
	h.clients[client] = true

	h.BroadcastAll(Message{Type: "update", Data: "payload"})

	select {
	case msg := <-client.send:
		assert.Contains(t, string(msg), "update")
		assert.Contains(t, string(msg), "payload")
	case <-time.After(time.Second):
		t.Fatal("expected message on client send channel")
	}
}

func TestBroadcastAll_OversizedMessage(t *testing.T) {
	h := newTestHub()
	client := &Client{
		send: make(chan []byte, 10),
	}
	h.clients[client] = true

	// Create a message larger than wsMaxBroadcastBytes (1MB)
	bigData := strings.Repeat("x", wsMaxBroadcastBytes+1)
	h.BroadcastAll(Message{Type: "big", Data: bigData})

	// Client should NOT receive the oversized message
	select {
	case <-client.send:
		t.Fatal("oversized message should be dropped")
	case <-time.After(100 * time.Millisecond):
		// Expected — message was dropped
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Hub.DisconnectUser — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestDisconnectUser_NoClients(t *testing.T) {
	h := newTestHub()
	userID := uuid.New()
	// Should not panic when user has no connections
	h.DisconnectUser(userID)
}

func TestDisconnectUser_SendsNilSentinel(t *testing.T) {
	h := newTestHub()
	userID := uuid.New()
	client := &Client{
		userID: userID,
		send:   make(chan []byte, 10),
	}
	h.mu.Lock()
	h.userIndex[userID] = []*Client{client}
	h.mu.Unlock()

	h.DisconnectUser(userID)

	select {
	case msg := <-client.send:
		assert.Nil(t, msg, "nil sentinel signals close")
	case <-time.After(time.Second):
		t.Fatal("expected nil sentinel on send channel")
	}
}
