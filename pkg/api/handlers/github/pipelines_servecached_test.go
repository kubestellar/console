package github

import (
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ---------- ghpBuildRequestFromFiber ----------

func TestGHPBuildRequestFromFiber_ExtractsQueryParams(t *testing.T) {
	var got ghpBuildRequest
	app := fiber.New()
	app.Get("/x", func(c *fiber.Ctx) error {
		got = ghpBuildRequestFromFiber(c)
		return c.SendStatus(200)
	})
	req := httptest.NewRequest("GET", "/x?repo=kubestellar/console&days=7", nil)
	req.Host = "localhost"
	if _, err := app.Test(req, -1); err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if got.repoQuery != "kubestellar/console" {
		t.Errorf("repoQuery = %q, want %q", got.repoQuery, "kubestellar/console")
	}
	if got.daysQuery != "7" {
		t.Errorf("daysQuery = %q, want %q", got.daysQuery, "7")
	}
	if got.ctx == nil {
		t.Error("ctx should not be nil")
	}
}

// ---------- serveCached ----------

// serveCachedViaApp runs h.serveCached inside a real fiber request so build
// callbacks can use c.UserContext(), and the response headers are observable.
func serveCachedViaApp(t *testing.T, h *GitHubPipelinesHandler, key string, build func(c *fiber.Ctx) (any, error)) (status int, headers map[string]string, body []byte) {
	t.Helper()
	app := fiber.New()
	app.Get("/sc", func(c *fiber.Ctx) error {
		return h.serveCached(c, key, build)
	})
	req := httptest.NewRequest("GET", "/sc", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	hdrs := map[string]string{
		"X-Cache":       resp.Header.Get("X-Cache"),
		"Content-Type":  resp.Header.Get("Content-Type"),
		"Cache-Control": resp.Header.Get("Cache-Control"),
	}
	return resp.StatusCode, hdrs, b
}

func TestServeCached_HitReturnsCachedBody(t *testing.T) {
	h := newTestGHPHandler()
	h.cache["k1"] = ghpCacheEntry{
		body: []byte(`{"cached":true}`),
		exp:  time.Now().Add(ghpCacheTTL),
	}
	var buildCalls int32
	build := func(c *fiber.Ctx) (any, error) {
		atomic.AddInt32(&buildCalls, 1)
		return nil, nil
	}
	status, hdrs, body := serveCachedViaApp(t, h, "k1", build)
	if status != 200 {
		t.Fatalf("status = %d, want 200", status)
	}
	if hdrs["X-Cache"] != "HIT" {
		t.Errorf("X-Cache = %q, want HIT", hdrs["X-Cache"])
	}
	if string(body) != `{"cached":true}` {
		t.Errorf("body = %s", body)
	}
	if got := atomic.LoadInt32(&buildCalls); got != 0 {
		t.Errorf("build called %d times on HIT, want 0", got)
	}
}

func TestServeCached_MissCallsBuildAndCaches(t *testing.T) {
	h := newTestGHPHandler()
	var buildCalls int32
	build := func(c *fiber.Ctx) (any, error) {
		atomic.AddInt32(&buildCalls, 1)
		// Non-object payload — code path takes the else branch (no repos merge).
		return []int{1, 2, 3}, nil
	}
	status, hdrs, body := serveCachedViaApp(t, h, "miss1", build)
	if status != 200 {
		t.Fatalf("status = %d, want 200", status)
	}
	if hdrs["X-Cache"] != "MISS" {
		t.Errorf("X-Cache = %q, want MISS", hdrs["X-Cache"])
	}
	if string(body) != "[1,2,3]" {
		t.Errorf("body = %s, want [1,2,3]", body)
	}
	if got := atomic.LoadInt32(&buildCalls); got != 1 {
		t.Errorf("build called %d times, want 1", got)
	}
	// Second request with same key must be a HIT.
	status2, hdrs2, body2 := serveCachedViaApp(t, h, "miss1", build)
	if status2 != 200 {
		t.Fatalf("2nd status = %d", status2)
	}
	if hdrs2["X-Cache"] != "HIT" {
		t.Errorf("2nd X-Cache = %q, want HIT", hdrs2["X-Cache"])
	}
	if string(body2) != "[1,2,3]" {
		t.Errorf("2nd body = %s", body2)
	}
	if got := atomic.LoadInt32(&buildCalls); got != 1 {
		t.Errorf("build called %d times after HIT, want 1", got)
	}
}

func TestServeCached_MissObjectMergesRepos(t *testing.T) {
	h := newTestGHPHandler()
	build := func(c *fiber.Ctx) (any, error) {
		return map[string]any{"ok": true}, nil
	}
	status, _, body := serveCachedViaApp(t, h, "obj", build)
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	// The object payload gets a trailing "repos":[...] injection.
	if !strings.Contains(string(body), `"ok":true`) {
		t.Errorf("body missing original field: %s", body)
	}
	if !strings.Contains(string(body), `"repos":`) {
		t.Errorf("body missing repos merge: %s", body)
	}
}

func TestServeCached_BuildErrorFallsBackToStale(t *testing.T) {
	h := newTestGHPHandler()
	// Seed an expired-but-within-stale-window entry.
	justExpired := time.Now().Add(-ghpCacheTTL).Add(-time.Second)
	h.cache["stale"] = ghpCacheEntry{
		body: []byte(`{"stale":true}`),
		exp:  justExpired.Add(ghpCacheTTL),
	}
	build := func(c *fiber.Ctx) (any, error) {
		return nil, errors.New("boom")
	}
	status, hdrs, body := serveCachedViaApp(t, h, "stale", build)
	if status != 200 {
		t.Fatalf("status = %d, want 200 (stale)", status)
	}
	if hdrs["X-Cache"] != "STALE" {
		t.Errorf("X-Cache = %q, want STALE", hdrs["X-Cache"])
	}
	if string(body) != `{"stale":true}` {
		t.Errorf("body = %s", body)
	}
}

func TestServeCached_BuildErrorNoStaleReturns502(t *testing.T) {
	h := newTestGHPHandler()
	build := func(c *fiber.Ctx) (any, error) {
		return nil, errors.New("upstream unavailable")
	}
	status, _, body := serveCachedViaApp(t, h, "nostale", build)
	if status != fiber.StatusBadGateway {
		t.Errorf("status = %d, want 502", status)
	}
	if !strings.Contains(string(body), "failed to fetch") {
		t.Errorf("body = %s", body)
	}
}

func TestServeCached_BuildFiberErrorPropagatesStatus(t *testing.T) {
	h := newTestGHPHandler()
	build := func(c *fiber.Ctx) (any, error) {
		return nil, fiber.NewError(fiber.StatusForbidden, "nope")
	}
	status, _, body := serveCachedViaApp(t, h, "fibErr", build)
	if status != fiber.StatusForbidden {
		t.Errorf("status = %d, want 403", status)
	}
	if !strings.Contains(string(body), "nope") {
		t.Errorf("body = %s", body)
	}
}
