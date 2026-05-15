package providers

import (
	"context"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	ollamaHealthCacheTTL        = 5 * time.Minute
	stellarOllamaScannerEnv     = "STELLAR_OLLAMA_SCANNER"
	stellarOllamaScannerDefault = "false"
)

// OllamaHealthCache caches Ollama health checks so scanner resolution does not
// hit the local endpoint on every call.
type OllamaHealthCache struct {
	healthy   bool
	checkedAt time.Time
	mu        sync.RWMutex
}

func (c *OllamaHealthCache) IsHealthy(ollamaProvider *OllamaProvider) bool {
	if ollamaProvider == nil {
		return false
	}

	now := time.Now()
	c.mu.RLock()
	if !c.checkedAt.IsZero() && now.Sub(c.checkedAt) < ollamaHealthCacheTTL {
		healthy := c.healthy
		c.mu.RUnlock()
		return healthy
	}
	c.mu.RUnlock()

	healthy := ollamaProvider.Health(context.Background()).Available
	checkedAt := time.Now()

	c.mu.Lock()
	c.healthy = healthy
	c.checkedAt = checkedAt
	c.mu.Unlock()

	return healthy
}

func ollamaScannerEnabled() bool {
	raw := strings.TrimSpace(os.Getenv(stellarOllamaScannerEnv))
	if raw == "" {
		raw = stellarOllamaScannerDefault
	}
	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		return false
	}
	return enabled
}
