package handlers

import (
	"github.com/kubestellar/console/pkg/safego"
	"golang.org/x/sync/singleflight"
	"sync"
	"time"
)

// sseCacheTTL is how long cached SSE responses are considered fresh.
const sseCacheTTL = 15 * time.Second

// sseCacheEvictInterval is how often the background goroutine sweeps the cache
// to remove expired entries and prevent unbounded memory growth.
const sseCacheEvictInterval = 30 * time.Second

// SSE response cache — avoids re-fetching when the user navigates away and back.
var (
	sseCache     = map[string]*sseCacheEntry{}
	sseCacheMu   sync.RWMutex
	sseCacheOnce sync.Once
	// sseCacheEvictDone is closed to stop the background evictor goroutine
	// on server shutdown or in tests, preventing goroutine leaks (#6956).
	sseCacheEvictDone = make(chan struct{})
	// #7045 — singleflight group coalesces concurrent cold-cache fetches for
	// the same cache key into a single Kubernetes API call.
	sseFetchGroup singleflight.Group
)

type sseCacheEntry struct {
	data      interface{}
	fetchedAt time.Time
}

// startSSECacheEvictor launches a background goroutine (once) that periodically
// deletes expired entries from sseCache so memory doesn't grow without bound.
// The goroutine exits when sseCacheEvictDone is closed (#6956).
func startSSECacheEvictor() {
	sseCacheOnce.Do(func() {
		safego.GoWith("sse-cache-evictor", func() {
			ticker := time.NewTicker(sseCacheEvictInterval)
			defer ticker.Stop()
			for {
				select {
				case <-sseCacheEvictDone:
					return
				case <-ticker.C:
					now := time.Now()
					sseCacheMu.Lock()
					for k, e := range sseCache {
						if now.Sub(e.fetchedAt) >= sseCacheTTL {
							delete(sseCache, k)
						}
					}
					sseCacheMu.Unlock()
				}
			}
		})
	})
}

// ClearSSECache removes all entries from the SSE response cache.
// Intended for testing environments where data changes more frequently
// than the cache TTL (#6956).
func ClearSSECache() {
	sseCacheMu.Lock()
	defer sseCacheMu.Unlock()
	sseCache = make(map[string]*sseCacheEntry)
}

// Safe to call multiple times. Intended for server shutdown and tests (#6956).
func StopSSECacheEvictor() {
	select {
	case <-sseCacheEvictDone:
		// Already closed
	default:
		close(sseCacheEvictDone)
	}
}

func sseCacheGet(key string) interface{} {
	// Fast path: take a read lock for the common case (entry exists and is
	// fresh). Previously this used an exclusive Lock which serialized every
	// concurrent cache read.
	sseCacheMu.RLock()
	e, ok := sseCache[key]
	if !ok {
		sseCacheMu.RUnlock()
		return nil
	}
	if time.Since(e.fetchedAt) < sseCacheTTL {
		data := e.data
		sseCacheMu.RUnlock()
		return data
	}
	// Expired — upgrade to a write lock to delete. The background evictor
	// also prunes expired entries, so losing the race here is harmless.
	//
	// #6591: Between releasing the RLock and acquiring the write Lock, another
	// goroutine may have refreshed the entry via sseCacheSet. Re-check under
	// the write lock and, if the entry is now fresh, return it instead of
	// dropping a freshly-populated value on the floor (which would force the
	// caller to re-fetch unnecessarily).
	sseCacheMu.RUnlock()
	sseCacheMu.Lock()
	if e2, ok := sseCache[key]; ok {
		if time.Since(e2.fetchedAt) < sseCacheTTL {
			data := e2.data
			sseCacheMu.Unlock()
			return data
		}
		delete(sseCache, key)
	}
	sseCacheMu.Unlock()
	return nil
}

func sseCacheSet(key string, data interface{}) {
	// Ensure the background evictor is running.
	startSSECacheEvictor()

	sseCacheMu.Lock()
	sseCache[key] = &sseCacheEntry{data: data, fetchedAt: time.Now()}
	sseCacheMu.Unlock()
}
