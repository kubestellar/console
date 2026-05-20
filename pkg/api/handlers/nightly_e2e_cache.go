package handlers

import (
	"context"
	"log/slog"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

const prewarmTimeout = 30 * time.Second

func (h *NightlyE2EHandler) prewarm() {
	// #7052 — Use a cancellable context so that on timeout, all goroutines
	// spawned by fetchAllWithContext are cancelled instead of abandoned.
	ctx, cancel := context.WithTimeout(context.Background(), prewarmTimeout)
	defer cancel()

	done := make(chan struct{})
	var resp *NightlyE2EResponse
	var fetchErr error

	safego.Go(func() {
		resp, fetchErr = h.fetchAllWithContext(ctx)
		close(done)
	})

	select {
	case <-done:
		if fetchErr != nil {
			slog.Warn("[NightlyE2E] prewarm failed", "error", fetchErr)
			return
		}
	case <-ctx.Done():
		slog.Warn("[NightlyE2E] prewarm timed out", "timeout", prewarmTimeout)
		return
	}

	ttl := nightlyCacheIdleTTL
	if hasInProgressRuns(resp.Guides) {
		ttl = nightlyCacheActiveTTL
	}
	h.mu.Lock()
	h.cache = resp
	h.cacheExp = time.Now().Add(ttl)
	h.mu.Unlock()
}

// getGuideImages returns cached image maps or fetches fresh ones from GitHub.
func (h *NightlyE2EHandler) getGuideImages() map[string]map[string]string {
	h.imgMu.RLock()
	if h.imgCache != nil && time.Now().Before(h.imgCacheExp) {
		result := h.imgCache
		h.imgMu.RUnlock()
		return result
	}
	h.imgMu.RUnlock()

	images := h.fetchAllGuideImages()

	h.imgMu.Lock()
	h.imgCache = images
	h.imgCacheExp = time.Now().Add(imageCacheTTL)
	h.imgMu.Unlock()

	return images
}
