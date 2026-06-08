package handlers

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// resetSSERegistry clears the global SSE session registry between tests.
func resetSSERegistry(t *testing.T) {
	t.Helper()
	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	sseSessions = make(map[uuid.UUID]map[uint64]context.CancelFunc)
	sseSessionSeq = 0
}

// ---------------------------------------------------------------------------
// registerSSESession
// ---------------------------------------------------------------------------

func TestRegisterSSESession_ReturnsUniqueIDs(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	cancel := func() {}

	id1 := registerSSESession(userID, cancel)
	id2 := registerSSESession(userID, cancel)
	id3 := registerSSESession(userID, cancel)

	if id1 == id2 || id2 == id3 || id1 == id3 {
		t.Errorf("expected unique IDs, got %d, %d, %d", id1, id2, id3)
	}
}

func TestRegisterSSESession_MonotonicallyIncreasing(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	cancel := func() {}

	id1 := registerSSESession(userID, cancel)
	id2 := registerSSESession(userID, cancel)

	if id2 <= id1 {
		t.Errorf("expected id2 > id1, got %d <= %d", id2, id1)
	}
}

func TestRegisterSSESession_MultipleUsers(t *testing.T) {
	resetSSERegistry(t)

	user1 := uuid.New()
	user2 := uuid.New()
	cancel := func() {}

	registerSSESession(user1, cancel)
	registerSSESession(user2, cancel)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()

	if _, ok := sseSessions[user1]; !ok {
		t.Error("user1 should have sessions registered")
	}
	if _, ok := sseSessions[user2]; !ok {
		t.Error("user2 should have sessions registered")
	}
}

// ---------------------------------------------------------------------------
// unregisterSSESession
// ---------------------------------------------------------------------------

func TestUnregisterSSESession_RemovesEntry(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	cancel := func() {}
	id := registerSSESession(userID, cancel)

	unregisterSSESession(userID, id)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	if _, ok := sseSessions[userID]; ok {
		t.Error("user entry should be fully removed when last session is unregistered")
	}
}

func TestUnregisterSSESession_KeepsOtherSessions(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	cancel := func() {}
	id1 := registerSSESession(userID, cancel)
	id2 := registerSSESession(userID, cancel)

	unregisterSSESession(userID, id1)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	sessions, ok := sseSessions[userID]
	if !ok {
		t.Fatal("user entry should still exist with remaining session")
	}
	if _, ok := sessions[id2]; !ok {
		t.Error("id2 should still be registered")
	}
	if _, ok := sessions[id1]; ok {
		t.Error("id1 should have been removed")
	}
}

func TestUnregisterSSESession_UnknownUserNoOp(t *testing.T) {
	resetSSERegistry(t)
	// Should not panic or error on unknown user
	unregisterSSESession(uuid.New(), 999)
}

func TestUnregisterSSESession_UnknownIDNoOp(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	registerSSESession(userID, func() {})

	// Unregister a non-existent session ID
	unregisterSSESession(userID, 999)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	if _, ok := sseSessions[userID]; !ok {
		t.Error("user entry should still exist after removing unknown ID")
	}
}

// ---------------------------------------------------------------------------
// CancelUserSSEStreams
// ---------------------------------------------------------------------------

func TestCancelUserSSEStreams_CancelsAll(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	var cancelled [3]bool

	for i := range cancelled {
		i := i
		ctx, cancel := context.WithCancel(context.Background())
		registerSSESession(userID, cancel)
		go func() {
			<-ctx.Done()
			cancelled[i] = true
		}()
	}

	CancelUserSSEStreams(userID)

	// Give goroutines a moment to complete
	for tries := 0; tries < 100; tries++ {
		allDone := cancelled[0] && cancelled[1] && cancelled[2]
		if allDone {
			break
		}
	}

	for i, c := range cancelled {
		if !c {
			t.Errorf("stream %d was not cancelled", i)
		}
	}
}

func TestCancelUserSSEStreams_ClearsRegistry(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	registerSSESession(userID, func() {})
	registerSSESession(userID, func() {})

	CancelUserSSEStreams(userID)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	if _, ok := sseSessions[userID]; ok {
		t.Error("user entry should be removed after CancelUserSSEStreams")
	}
}

func TestCancelUserSSEStreams_UnknownUserNoOp(t *testing.T) {
	resetSSERegistry(t)
	// Should not panic on unknown user
	CancelUserSSEStreams(uuid.New())
}

func TestCancelUserSSEStreams_DoesNotAffectOtherUsers(t *testing.T) {
	resetSSERegistry(t)

	user1 := uuid.New()
	user2 := uuid.New()

	registerSSESession(user1, func() {})
	registerSSESession(user2, func() {})

	CancelUserSSEStreams(user1)

	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	if _, ok := sseSessions[user2]; !ok {
		t.Error("user2 sessions should not be affected")
	}
}

// ---------------------------------------------------------------------------
// Concurrency safety
// ---------------------------------------------------------------------------

func TestSSESessionRegistry_ConcurrentAccess(t *testing.T) {
	resetSSERegistry(t)

	userID := uuid.New()
	const goroutines = 50
	var wg sync.WaitGroup
	wg.Add(goroutines * 2)

	// Concurrent registrations
	ids := make([]uint64, goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			ids[idx] = registerSSESession(userID, func() {})
		}(i)
	}

	// Concurrent unregistrations (of ids that may or may not exist yet)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			unregisterSSESession(userID, uint64(idx+1))
		}(i)
	}

	wg.Wait()
	// No panic = test passes. Registry may have some entries remaining.
}
