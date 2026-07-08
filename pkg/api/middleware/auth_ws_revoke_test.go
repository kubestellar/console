package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// ValidateWebSocketOrigin + isWSOriginAllowed
// ---------------------------------------------------------------------------

func TestValidateWebSocketOrigin_NoOrigin(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Host = "localhost"
	// No Origin header — non-browser client should be allowed unconditionally.
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestValidateWebSocketOrigin_DevMode(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(true), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "https://attacker.example.com")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"dev mode should allow any origin")
}

func TestValidateWebSocketOrigin_Rejected(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "https://attacker.example.com")
	req.Host = "console.kubestellar.io"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode,
		"mismatched origin must be rejected")
}

func TestValidateWebSocketOrigin_MatchesHost(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "http://console.kubestellar.io")
	req.Host = "console.kubestellar.io"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"origin matching host should be allowed")
}

func TestValidateWebSocketOrigin_EnvAllowList(t *testing.T) {
	t.Setenv(envAllowedWSOrigins, "https://allowed.example.com, https://also-allowed.dev")

	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	t.Run("allowed origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "https://allowed.example.com")
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("second allowed origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "https://also-allowed.dev")
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("unlisted origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "https://evil.example.com")
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode,
			"origins not in env allow-list must be rejected")
	})
}

func TestIsWSOriginAllowed_CaseInsensitive(t *testing.T) {
	t.Setenv(envAllowedWSOrigins, "https://Console.Example.Com")

	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "https://console.example.com")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"origin comparison must be case-insensitive")
}

func TestIsWSOriginAllowed_TrailingSlash(t *testing.T) {
	t.Setenv(envAllowedWSOrigins, "https://console.example.com/")

	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "https://console.example.com")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"trailing slash must be normalized")
}

func TestIsWSOriginAllowed_HTTPSFromXForwardedProto(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", ValidateWebSocketOrigin(false), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "https://console.kubestellar.io")
	req.Host = "console.kubestellar.io"
	req.Header.Set("X-Forwarded-Proto", "https")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"X-Forwarded-Proto: https should derive https:// server origin")
}

// ---------------------------------------------------------------------------
// Revoke — cache eviction when exceeding revokedTokenCacheMaxSize
// ---------------------------------------------------------------------------

func TestRevoke_EvictsExpiredEntries(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	// Fill the cache past max size with expired entries.
	now := time.Now()
	for i := 0; i < revokedTokenCacheMaxSize+10; i++ {
		jti := fmt.Sprintf("expired-%d", i)
		revokedTokens.Revoke(jti, now.Add(-1*time.Hour))
	}

	// The eviction sweep inside Revoke should have pruned expired entries.
	revokedTokens.RLock()
	size := len(revokedTokens.tokens)
	revokedTokens.RUnlock()

	assert.Less(t, size, revokedTokenCacheMaxSize,
		"expired entries should be evicted when cache exceeds max size")
}

func TestRevoke_EvictsZeroTimeEntries(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	// Fill with zero-time (backfilled) entries that won't expire naturally.
	for i := 0; i < revokedTokenCacheMaxSize+10; i++ {
		jti := fmt.Sprintf("backfill-%d", i)
		revokedTokens.Lock()
		revokedTokens.tokens[jti] = time.Time{} // zero-time entry
		revokedTokens.Unlock()
	}
	// Trigger eviction via one more Revoke.
	revokedTokens.Revoke("trigger", time.Now().Add(time.Hour))

	revokedTokens.RLock()
	size := len(revokedTokens.tokens)
	revokedTokens.RUnlock()

	assert.LessOrEqual(t, size, revokedTokenCacheMaxSize,
		"zero-time entries should be evicted as second-pass fallback")
}

// ---------------------------------------------------------------------------
// cleanup — half-max zero-time eviction
// ---------------------------------------------------------------------------

func TestCleanup_EvictsZeroTimeAtHalfMax(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	halfMax := revokedTokenCacheMaxSize / 2

	// Add halfMax+50 zero-time entries (over the half-max threshold).
	for i := 0; i < halfMax+50; i++ {
		jti := fmt.Sprintf("zero-%d", i)
		revokedTokens.Lock()
		revokedTokens.tokens[jti] = time.Time{}
		revokedTokens.Unlock()
	}
	// Add a few with real expiry in the future.
	for i := 0; i < 5; i++ {
		jti := fmt.Sprintf("real-%d", i)
		revokedTokens.Revoke(jti, time.Now().Add(time.Hour))
	}

	revokedTokens.cleanup()

	revokedTokens.RLock()
	size := len(revokedTokens.tokens)
	revokedTokens.RUnlock()

	// Zero-time entries should be gone; only the 5 real-expiry entries remain.
	assert.Equal(t, 5, size,
		"cleanup should evict zero-time entries when cache is above half-max")
}

func TestCleanup_KeepsZeroTimeBelowHalfMax(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	// Add a small number of zero-time entries (well below half-max).
	for i := 0; i < 10; i++ {
		jti := fmt.Sprintf("zero-%d", i)
		revokedTokens.Lock()
		revokedTokens.tokens[jti] = time.Time{}
		revokedTokens.Unlock()
	}

	revokedTokens.cleanup()

	revokedTokens.RLock()
	size := len(revokedTokens.tokens)
	revokedTokens.RUnlock()

	assert.Equal(t, 10, size,
		"cleanup should keep zero-time entries when cache is below half-max")
}

func TestCleanup_RemovesExpiredKeepsFresh(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	now := time.Now()
	// 3 expired, 2 fresh
	revokedTokens.Revoke("exp-1", now.Add(-2*time.Hour))
	revokedTokens.Revoke("exp-2", now.Add(-1*time.Hour))
	revokedTokens.Revoke("exp-3", now.Add(-30*time.Minute))
	revokedTokens.Revoke("fresh-1", now.Add(time.Hour))
	revokedTokens.Revoke("fresh-2", now.Add(2*time.Hour))

	revokedTokens.cleanup()

	assert.True(t, IsTokenRevoked("fresh-1"))
	assert.True(t, IsTokenRevoked("fresh-2"))
	assert.False(t, IsTokenRevoked("exp-1"))
	assert.False(t, IsTokenRevoked("exp-2"))
	assert.False(t, IsTokenRevoked("exp-3"))
}
