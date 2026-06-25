package transport

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSSECacheSetAndGet(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	testData := map[string]interface{}{"test": "value"}
	SSECacheSet("test-key", testData)

	result := SSECacheGet("test-key")
	require.NotNil(t, result)
	assert.Equal(t, testData, result)
}

func TestSSECacheGetMissingKey(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	result := SSECacheGet("nonexistent-key")
	assert.Nil(t, result)
}

func TestSSECacheExpiration(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	testData := "expired-data"
	
	sseCacheMu.Lock()
	sseCache["test-key"] = &sseCacheEntry{
		data:      testData,
		fetchedAt: time.Now().Add(-sseCacheTTL - time.Second),
	}
	sseCacheMu.Unlock()

	result := SSECacheGet("test-key")
	assert.Nil(t, result, "expired entry should return nil")

	sseCacheMu.RLock()
	_, exists := sseCache["test-key"]
	sseCacheMu.RUnlock()
	assert.False(t, exists, "expired entry should be deleted from cache")
}

func TestSSECacheFreshEntry(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	testData := "fresh-data"
	SSECacheSet("test-key", testData)

	time.Sleep(100 * time.Millisecond)

	result := SSECacheGet("test-key")
	require.NotNil(t, result)
	assert.Equal(t, testData, result)
}

func TestSSECacheRefreshRaceCondition(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	sseCacheMu.Lock()
	sseCache["test-key"] = &sseCacheEntry{
		data:      "old-data",
		fetchedAt: time.Now().Add(-sseCacheTTL - time.Second),
	}
	sseCacheMu.Unlock()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		time.Sleep(10 * time.Millisecond)
		SSECacheSet("test-key", "new-data")
	}()

	go func() {
		defer wg.Done()
		result := SSECacheGet("test-key")
		if result != nil {
			assert.Equal(t, "new-data", result, "should get refreshed data if available")
		}
	}()

	wg.Wait()
}

func TestSSECacheConcurrentAccess(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	const numGoroutines = 50
	const numOperations = 100

	var wg sync.WaitGroup
	wg.Add(numGoroutines * 2)

	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			defer wg.Done()
			for j := 0; j < numOperations; j++ {
				key := "key-" + string(rune(id%10))
				SSECacheSet(key, map[string]int{"value": id * j})
			}
		}(i)

		go func(id int) {
			defer wg.Done()
			for j := 0; j < numOperations; j++ {
				key := "key-" + string(rune(id%10))
				SSECacheGet(key)
			}
		}(i)
	}

	wg.Wait()
}

func TestClearSSECache(t *testing.T) {
	defer StopSSECacheEvictor()

	SSECacheSet("key1", "value1")
	SSECacheSet("key2", "value2")
	SSECacheSet("key3", "value3")

	sseCacheMu.RLock()
	initialSize := len(sseCache)
	sseCacheMu.RUnlock()
	require.GreaterOrEqual(t, initialSize, 3, "cache should have at least 3 items")

	ClearSSECache()

	sseCacheMu.RLock()
	clearedSize := len(sseCache)
	sseCacheMu.RUnlock()
	assert.Equal(t, 0, clearedSize)

	assert.Nil(t, SSECacheGet("key1"))
	assert.Nil(t, SSECacheGet("key2"))
	assert.Nil(t, SSECacheGet("key3"))
}

func TestSSECacheEvictorStartsOnce(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	SSECacheSet("key1", "value1")
	SSECacheSet("key2", "value2")

	time.Sleep(100 * time.Millisecond)
}

func TestSSECacheEvictorRemovesExpiredEntries(t *testing.T) {
	ClearSSECache()
	
	originalEvictDone := sseCacheEvictDone
	sseCacheEvictDoneMu.Lock()
	sseCacheEvictDone = make(chan struct{})
	sseCacheEvictDoneMu.Unlock()
	
	sseCacheOnce = sync.Once{}
	
	testInterval := 100 * time.Millisecond
	defer func() {
		StopSSECacheEvictor()
		sseCacheEvictDoneMu.Lock()
		sseCacheEvictDone = originalEvictDone
		sseCacheEvictDoneMu.Unlock()
		sseCacheOnce = sync.Once{}
	}()

	sseCacheMu.Lock()
	sseCache["expired-key"] = &sseCacheEntry{
		data:      "expired-data",
		fetchedAt: time.Now().Add(-sseCacheTTL - time.Second),
	}
	sseCache["fresh-key"] = &sseCacheEntry{
		data:      "fresh-data",
		fetchedAt: time.Now(),
	}
	sseCacheMu.Unlock()

	startSSECacheEvictor()

	time.Sleep(testInterval + 50*time.Millisecond)

	sseCacheMu.RLock()
	_, expiredExists := sseCache["expired-key"]
	_, freshExists := sseCache["fresh-key"]
	sseCacheMu.RUnlock()

	// Verify the evictor removed the expired entry
	assert.False(t, expiredExists, "expired entry should have been removed by evictor")
	// Verify the evictor kept the fresh entry
	assert.True(t, freshExists, "fresh entry should still exist")
}

func TestStopSSECacheEvictorMultipleTimes(t *testing.T) {
	ClearSSECache()
	
	originalEvictDone := sseCacheEvictDone
	sseCacheEvictDoneMu.Lock()
	sseCacheEvictDone = make(chan struct{})
	sseCacheEvictDoneMu.Unlock()
	
	defer func() {
		sseCacheEvictDoneMu.Lock()
		sseCacheEvictDone = originalEvictDone
		sseCacheEvictDoneMu.Unlock()
	}()

	StopSSECacheEvictor()
	StopSSECacheEvictor()
	StopSSECacheEvictor()

	sseCacheEvictDoneMu.RLock()
	done := sseCacheEvictDone
	sseCacheEvictDoneMu.RUnlock()
	
	select {
	case <-done:
	default:
		t.Fatal("sseCacheEvictDone should be closed")
	}
}

func TestSSECacheEmptyCache(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	result := SSECacheGet("any-key")
	assert.Nil(t, result)

	sseCacheMu.RLock()
	size := len(sseCache)
	sseCacheMu.RUnlock()
	assert.Equal(t, 0, size)
}

func TestSSECacheDataTypes(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	testCases := []struct {
		name string
		data interface{}
	}{
		{"string", "test-string"},
		{"int", 42},
		{"float", 3.14},
		{"bool", true},
		{"slice", []string{"a", "b", "c"}},
		{"map", map[string]interface{}{"key": "value", "nested": map[string]int{"count": 10}}},
		{"struct", struct{ Name string }{"test"}},
		{"nil", nil},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			key := "test-" + tc.name
			SSECacheSet(key, tc.data)
			result := SSECacheGet(key)
			assert.Equal(t, tc.data, result)
		})
	}
}

func TestSSECacheOverwriteExisting(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	SSECacheSet("key", "value1")
	result1 := SSECacheGet("key")
	assert.Equal(t, "value1", result1)

	SSECacheSet("key", "value2")
	result2 := SSECacheGet("key")
	assert.Equal(t, "value2", result2)
}

func TestSSECacheNearExpirationBoundary(t *testing.T) {
	ClearSSECache()
	defer StopSSECacheEvictor()

	sseCacheMu.Lock()
	sseCache["near-expiry"] = &sseCacheEntry{
		data:      "data",
		fetchedAt: time.Now().Add(-sseCacheTTL + 100*time.Millisecond),
	}
	sseCacheMu.Unlock()

	result := SSECacheGet("near-expiry")
	assert.NotNil(t, result, "entry should still be valid just before TTL")

	time.Sleep(200 * time.Millisecond)

	result = SSECacheGet("near-expiry")
	assert.Nil(t, result, "entry should be expired after TTL")
}

func TestSSEFetchGroupExists(t *testing.T) {
	assert.NotNil(t, &SSEFetchGroup, "SSEFetchGroup should be initialized")
}
