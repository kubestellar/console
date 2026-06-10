package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ---------- Helpers ----------

// newTestGHPHandler returns a minimal GitHubPipelinesHandler suitable for
// testing cache-only logic (no real GitHub token or store required).
func newTestGHPHandler() *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		cache: make(map[string]ghpCacheEntry),
	}
}

// cacheKeyViaApp calls h.cacheKey through a real fiber request so that
// fiber's Query helper works correctly.
func cacheKeyViaApp(t *testing.T, h *GitHubPipelinesHandler, rawQuery string) string {
	t.Helper()
	var got string
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		got = h.cacheKey(c)
		return c.SendStatus(200)
	})
	req := httptest.NewRequest("GET", "/test?"+rawQuery, nil)
	if _, err := app.Test(req, -1); err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	return got
}

// ---------- cacheKey ----------

func TestGHPCacheKey_DefaultView(t *testing.T) {
	h := newTestGHPHandler()
	key := cacheKeyViaApp(t, h, "")
	// Default view is "pulse", which includes a date prefix.
	if !strings.HasPrefix(key, "pulse:") {
		t.Errorf("expected key to start with 'pulse:', got %q", key)
	}
}

func TestGHPCacheKey_PulseIncludesDatePrefix(t *testing.T) {
	h := newTestGHPHandler()
	key := cacheKeyViaApp(t, h, "view=pulse")
	parts := strings.SplitN(key, ":", 3)
	if parts[0] != "pulse" {
		t.Errorf("expected first segment 'pulse', got %q", parts[0])
	}
	// Date prefix should be non-empty for pulse view.
	if parts[1] == "" {
		t.Errorf("expected non-empty date prefix for pulse view, got empty string; full key: %q", key)
	}
}

func TestGHPCacheKey_NonPulseHasEmptyDatePrefix(t *testing.T) {
	h := newTestGHPHandler()
	key := cacheKeyViaApp(t, h, "view=matrix")
	// For non-pulse views the date prefix slot should be empty.
	if !strings.HasPrefix(key, "matrix::") {
		t.Errorf("expected key to start with 'matrix::', got %q", key)
	}
}

func TestGHPCacheKey_RepoAndJobQueryParams(t *testing.T) {
	h := newTestGHPHandler()
	key := cacheKeyViaApp(t, h, "view=failures&repo=kubestellar/console&job=build")
	// Verify repo and job are embedded in the key.
	if !strings.Contains(key, "kubestellar/console") {
		t.Errorf("expected repo in cache key, got %q", key)
	}
	if !strings.Contains(key, "build") {
		t.Errorf("expected job in cache key, got %q", key)
	}
}

func TestGHPCacheKey_DefaultRepoIsAll(t *testing.T) {
	h := newTestGHPHandler()
	key := cacheKeyViaApp(t, h, "view=matrix")
	if !strings.Contains(key, ":all:") {
		t.Errorf("expected 'all' as default repo in cache key, got %q", key)
	}
}

// ---------- getStale ----------

func TestGHPGetStale_EmptyCache(t *testing.T) {
	h := newTestGHPHandler()
	if got := h.getStale("missing"); got != nil {
		t.Fatalf("expected nil for empty cache, got %v", got)
	}
}

func TestGHPGetStale_WithinStalenessWindow(t *testing.T) {
	h := newTestGHPHandler()
	// Insert an entry that has just expired (fetchedAt = now - ghpCacheTTL - 1s)
	// but is still within the ghpCacheStaleTTL window.
	justExpired := time.Now().Add(-ghpCacheTTL).Add(-time.Second)
	h.cache["stale-key"] = ghpCacheEntry{
		body: []byte(`{"ok":true}`),
		exp:  justExpired.Add(ghpCacheTTL), // exp = now - 1s
	}
	got := h.getStale("stale-key")
	if got == nil {
		t.Fatal("expected stale entry within staleness window, got nil")
	}
	if string(got.body) != `{"ok":true}` {
		t.Errorf("unexpected stale body: %s", got.body)
	}
}

func TestGHPGetStale_TooOld(t *testing.T) {
	h := newTestGHPHandler()
	// Insert an entry that is older than ghpCacheTTL + ghpCacheStaleTTL.
	tooOld := time.Now().Add(-ghpCacheTTL).Add(-ghpCacheStaleTTL).Add(-time.Second)
	h.cache["ancient"] = ghpCacheEntry{
		body: []byte(`"old"`),
		exp:  tooOld.Add(ghpCacheTTL),
	}
	if got := h.getStale("ancient"); got != nil {
		t.Fatalf("expected nil for too-old entry, got %v", got)
	}
}

// ---------- ghpStoreRateLimitHeaders ----------

func TestGHPStoreRateLimitHeaders_AllHeaders(t *testing.T) {
	resp := &http.Response{Header: make(http.Header)}
	resp.Header.Set("X-RateLimit-Limit", "60")
	resp.Header.Set("X-RateLimit-Remaining", "42")
	resp.Header.Set("X-RateLimit-Reset", "1717171717")
	resp.Header.Set("X-RateLimit-Used", "18")

	ctx := ghpStoreRateLimitHeaders(context.Background(), resp)
	headers, ok := ctx.Value(ghpRateLimitHeadersKey).(map[string]string)
	if !ok {
		t.Fatal("expected rate-limit headers map in context, got none")
	}
	checks := map[string]string{
		"X-RateLimit-Limit":     "60",
		"X-RateLimit-Remaining": "42",
		"X-RateLimit-Reset":     "1717171717",
		"X-RateLimit-Used":      "18",
	}
	for k, want := range checks {
		if got := headers[k]; got != want {
			t.Errorf("header %s: want %q, got %q", k, want, got)
		}
	}
}

func TestGHPStoreRateLimitHeaders_NoHeaders(t *testing.T) {
	resp := &http.Response{Header: make(http.Header)}
	ctx := ghpStoreRateLimitHeaders(context.Background(), resp)
	// When no rate-limit headers are present the context must be unchanged.
	if v := ctx.Value(ghpRateLimitHeadersKey); v != nil {
		t.Fatalf("expected no value in context when no headers present, got %v", v)
	}
}

func TestGHPStoreRateLimitHeaders_PartialHeaders(t *testing.T) {
	resp := &http.Response{Header: make(http.Header)}
	resp.Header.Set("X-RateLimit-Remaining", "5")

	ctx := ghpStoreRateLimitHeaders(context.Background(), resp)
	headers, ok := ctx.Value(ghpRateLimitHeadersKey).(map[string]string)
	if !ok {
		t.Fatal("expected rate-limit headers map in context")
	}
	if len(headers) != 1 {
		t.Errorf("expected 1 header, got %d: %v", len(headers), headers)
	}
	if headers["X-RateLimit-Remaining"] != "5" {
		t.Errorf("unexpected value: %v", headers)
	}
}

// ---------- ghpForwardRateLimitHeaders ----------

func TestGHPForwardRateLimitHeaders_ForwardsAll(t *testing.T) {
	upstream := &http.Response{Header: make(http.Header)}
	upstream.Header.Set("X-RateLimit-Limit", "5000")
	upstream.Header.Set("X-RateLimit-Remaining", "4999")
	upstream.Header.Set("X-RateLimit-Reset", "1717171717")
	upstream.Header.Set("X-RateLimit-Used", "1")

	var capturedHeaders map[string]string
	app := fiber.New()
	app.Get("/fwd", func(c *fiber.Ctx) error {
		ghpForwardRateLimitHeaders(c, upstream)
		capturedHeaders = make(map[string]string)
		for _, h := range []string{"X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-RateLimit-Used"} {
			capturedHeaders[h] = c.GetRespHeader(h)
		}
		return c.SendStatus(200)
	})
	req := httptest.NewRequest("GET", "/fwd", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()

	checks := map[string]string{
		"X-RateLimit-Limit":     "5000",
		"X-RateLimit-Remaining": "4999",
		"X-RateLimit-Reset":     "1717171717",
		"X-RateLimit-Used":      "1",
	}
	for k, want := range checks {
		if got := resp.Header.Get(k); got != want {
			t.Errorf("forwarded header %s: want %q, got %q", k, want, got)
		}
	}
}

func TestGHPForwardRateLimitHeaders_NoHeadersNoOp(t *testing.T) {
	upstream := &http.Response{Header: make(http.Header)}
	app := fiber.New()
	app.Get("/noop", func(c *fiber.Ctx) error {
		ghpForwardRateLimitHeaders(c, upstream)
		return c.SendStatus(200)
	})
	req := httptest.NewRequest("GET", "/noop", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	for _, h := range []string{"X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-RateLimit-Used"} {
		if v := resp.Header.Get(h); v != "" {
			t.Errorf("expected no %s header, got %q", h, v)
		}
	}
}
