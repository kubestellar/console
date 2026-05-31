package providers

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"
)

func TestOllamaHealthCacheRefreshesOnlyWhenStale(t *testing.T) {
	t.Parallel()

	const staleOffset = time.Second

	statuses := []int{http.StatusOK, http.StatusServiceUnavailable}
	var hits atomic.Int32

	provider, cleanup := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Fatalf("path = %s, want /api/tags", r.URL.Path)
		}
		index := int(hits.Add(1)) - 1
		if index >= len(statuses) {
			index = len(statuses) - 1
		}
		w.WriteHeader(statuses[index])
	})
	defer cleanup()

	cache := &OllamaHealthCache{}
	if !cache.IsHealthy(provider) {
		t.Fatal("first IsHealthy() = false, want true")
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("hits after first check = %d, want 1", got)
	}
	if !cache.IsHealthy(provider) {
		t.Fatal("second IsHealthy() = false, want cached true")
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("hits after cached check = %d, want 1", got)
	}

	cache.mu.Lock()
	cache.checkedAt = time.Now().Add(-ollamaHealthCacheTTL - staleOffset)
	cache.mu.Unlock()

	if cache.IsHealthy(provider) {
		t.Fatal("stale IsHealthy() = true, want false after refresh")
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("hits after stale refresh = %d, want 2", got)
	}
}

func TestOllamaScannerEnabledParsesTrimmedValues(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "trimmed true", value: " true ", want: true},
		{name: "trimmed false", value: " false ", want: false},
		{name: "default false", value: "", want: false},
		{name: "invalid false", value: "not-a-bool", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(stellarOllamaScannerEnv, tt.value)
			if got := ollamaScannerEnabled(); got != tt.want {
				t.Fatalf("ollamaScannerEnabled() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOllamaHealthUsesRequestContext(t *testing.T) {
	t.Parallel()

	provider, cleanup := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be reached for canceled context")
	})
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result := provider.Health(ctx)
	if result.Available {
		t.Fatal("Available = true, want false")
	}
	if result.Error == "" {
		t.Fatal("Error = empty, want context cancellation error")
	}
}
