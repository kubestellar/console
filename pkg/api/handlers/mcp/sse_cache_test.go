package handlers

import (
	"testing"
	"time"
)

// clearCacheForTest clears all SSE cache entries without touching the evictor
// goroutine or its done channel.  Reassigning sseCacheEvictDone while the
// evictor goroutine is running causes a data race, so we only ever clear
// entries between tests.
func clearCacheForTest(t *testing.T) {
	t.Helper()
	ClearSSECache()
}

// ---------- sseCacheGet ----------

func TestSSECacheGet_MissingKey(t *testing.T) {
	clearCacheForTest(t)
	if got := sseCacheGet("nonexistent"); got != nil {
		t.Fatalf("expected nil for missing key, got %v", got)
	}
}

func TestSSECacheGet_FreshEntry(t *testing.T) {
	clearCacheForTest(t)
	want := []string{"a", "b"}
	sseCacheSet("k1", want)
	got := sseCacheGet("k1")
	if got == nil {
		t.Fatal("expected data for fresh cache entry, got nil")
	}
}

func TestSSECacheGet_ExpiredEntry(t *testing.T) {
	clearCacheForTest(t)
	// Insert an entry that is already past the TTL.
	sseCacheMu.Lock()
	sseCache["old"] = &sseCacheEntry{
		data:      "stale",
		fetchedAt: time.Now().Add(-(sseCacheTTL + time.Second)),
	}
	sseCacheMu.Unlock()

	if got := sseCacheGet("old"); got != nil {
		t.Fatalf("expected nil for expired entry, got %v", got)
	}
	// The expired entry should have been removed.
	sseCacheMu.RLock()
	_, exists := sseCache["old"]
	sseCacheMu.RUnlock()
	if exists {
		t.Error("expired entry should have been deleted from cache")
	}
}

func TestSSECacheGet_EntryRefreshedBetweenLocks(t *testing.T) {
	// Covers the race-safe re-check: the entry may be refreshed between the
	// RLock expiry detection and the write-lock delete.
	clearCacheForTest(t)
	sseCacheMu.Lock()
	sseCache["race"] = &sseCacheEntry{
		data:      "refreshed",
		fetchedAt: time.Now(), // fresh now
	}
	sseCacheMu.Unlock()

	got := sseCacheGet("race")
	if got == nil {
		t.Fatal("expected data for entry that was just refreshed, got nil")
	}
}

// ---------- sseCacheSet ----------

func TestSSECacheSet_StoresData(t *testing.T) {
	clearCacheForTest(t)
	sseCacheSet("setkey", 42)
	sseCacheMu.RLock()
	e, ok := sseCache["setkey"]
	sseCacheMu.RUnlock()
	if !ok {
		t.Fatal("key not found after sseCacheSet")
	}
	if e.data != 42 {
		t.Fatalf("expected data=42, got %v", e.data)
	}
	if time.Since(e.fetchedAt) > time.Second {
		t.Error("fetchedAt is too far in the past")
	}
}

func TestSSECacheSet_OverwritesExisting(t *testing.T) {
	clearCacheForTest(t)
	sseCacheSet("dup", "first")
	sseCacheSet("dup", "second")
	got := sseCacheGet("dup")
	if got != "second" {
		t.Fatalf("expected 'second' after overwrite, got %v", got)
	}
}

// ---------- ClearSSECache ----------

func TestClearSSECache_EmptiesCache(t *testing.T) {
	clearCacheForTest(t)
	sseCacheSet("a", 1)
	sseCacheSet("b", 2)
	ClearSSECache()
	sseCacheMu.RLock()
	n := len(sseCache)
	sseCacheMu.RUnlock()
	if n != 0 {
		t.Fatalf("expected empty cache after ClearSSECache, got %d entries", n)
	}
}

// ---------- StopSSECacheEvictor ----------

func TestStopSSECacheEvictor_IdempotentSecondCall(t *testing.T) {
	clearCacheForTest(t)
	StopSSECacheEvictor()
	// Second call must not panic (closing an already-closed channel would panic
	// without the guard in StopSSECacheEvictor).
	StopSSECacheEvictor()
}

func TestStopSSECacheEvictor_ClosesChannel(t *testing.T) {
	clearCacheForTest(t)
	StopSSECacheEvictor()
	select {
	case <-sseCacheEvictDone:
		// channel is closed — correct
	default:
		t.Error("sseCacheEvictDone should be closed after StopSSECacheEvictor")
	}
}
