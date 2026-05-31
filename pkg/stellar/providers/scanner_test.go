package providers

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func newScannerOllamaProvider(t *testing.T, status int, hits *atomic.Int32) *OllamaProvider {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(status)
	}))
	t.Cleanup(server.Close)

	provider := NewOllama(server.URL)
	provider.client = server.Client()
	return provider
}

func TestScannerOllamaHealthCache_RefreshesAndCachesResult(t *testing.T) {
	t.Parallel()

	var hits atomic.Int32
	provider := newScannerOllamaProvider(t, http.StatusOK, &hits)
	cache := &OllamaHealthCache{}

	assert.True(t, cache.IsHealthy(provider))
	assert.True(t, cache.IsHealthy(provider))
	assert.Equal(t, int32(1), hits.Load())
	assert.True(t, cache.healthy)
	assert.False(t, cache.checkedAt.IsZero())
}

func TestScannerOllamaHealthCache_CachesUnhealthyResult(t *testing.T) {
	t.Parallel()

	var hits atomic.Int32
	provider := newScannerOllamaProvider(t, http.StatusServiceUnavailable, &hits)
	cache := &OllamaHealthCache{checkedAt: time.Now().Add(-ollamaHealthCacheTTL - time.Second)}

	assert.False(t, cache.IsHealthy(provider))
	assert.False(t, cache.IsHealthy(provider))
	assert.Equal(t, int32(1), hits.Load())
	assert.False(t, cache.healthy)
}

func TestScannerOllamaHealthCache_RefreshesWhenStale(t *testing.T) {
	t.Parallel()

	statuses := []int{http.StatusOK, http.StatusServiceUnavailable}
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		index := int(hits.Add(1)) - 1
		if index >= len(statuses) {
			index = len(statuses) - 1
		}
		w.WriteHeader(statuses[index])
	}))
	t.Cleanup(server.Close)

	provider := NewOllama(server.URL)
	provider.client = server.Client()
	cache := &OllamaHealthCache{}

	assert.True(t, cache.IsHealthy(provider))
	assert.Equal(t, int32(1), hits.Load())
	cache.mu.Lock()
	cache.checkedAt = time.Now().Add(-ollamaHealthCacheTTL - time.Second)
	cache.mu.Unlock()
	assert.False(t, cache.IsHealthy(provider))
	assert.Equal(t, int32(2), hits.Load())
}

func TestScannerOllamaScannerEnabled_TrimmedValues(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, " true ")
	assert.True(t, ollamaScannerEnabled())

	t.Setenv(stellarOllamaScannerEnv, " not-a-bool ")
	assert.False(t, ollamaScannerEnabled())
}
