package compliance

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestACMMForceRefreshLimiter_PurgeExpiredDeletesStaleEntries covers the
// previously-uncovered `delete(l.lastRequest, key)` branch in purgeExpired
// at pkg/api/handlers/compliance/acmm_scan.go:123. The existing suite only
// calls Allow() with `now` close to the seed timestamp, so `Before(cutoff)`
// never fires and the map never shrinks. A regression that inverted the
// comparison would silently leak entries forever without failing any test.
func TestACMMForceRefreshLimiter_PurgeExpiredDeletesStaleEntries(t *testing.T) {
	l := newACMMForceRefreshLimiter()

	base := time.Now()
	staleKey := "user-a:owner/repo"
	freshKey := "user-b:owner/repo"

	// Seed two records at t=base.
	allowed, _ := l.Allow(staleKey, base)
	require.True(t, allowed)
	allowed, _ = l.Allow(freshKey, base)
	require.True(t, allowed)

	// Advance well past the record TTL so BOTH seeded records satisfy
	// `lastRequestAt.Before(cutoff)` and must be deleted by purgeExpired.
	future := base.Add(acmmForceRefreshRecordTTL + time.Second)

	// This Allow() call triggers purgeExpired at `future`. Because both
	// records are now stale, they should both be deleted first, then the
	// staleKey is freshly re-added.
	allowed, _ = l.Allow(staleKey, future)
	assert.True(t, allowed, "expired record should have been purged")

	l.mu.Lock()
	_, freshStillPresent := l.lastRequest[freshKey]
	_, staleNowPresent := l.lastRequest[staleKey]
	mapSize := len(l.lastRequest)
	l.mu.Unlock()

	assert.False(t, freshStillPresent,
		"purgeExpired must delete records older than the TTL (the loop-body delete arm)")
	assert.True(t, staleNowPresent,
		"stale key should have been re-added by the fresh Allow at `future`")
	assert.Equal(t, 1, mapSize,
		"map must contain exactly the one just-re-added record")
}

// TestACMMForceRefreshLimiter_PurgeExpiredKeepsFreshEntries covers the
// complement: `lastRequestAt.Before(cutoff)` is false so the record is
// kept. A regression that unconditionally deleted every entry would be
// caught here.
func TestACMMForceRefreshLimiter_PurgeExpiredKeepsFreshEntries(t *testing.T) {
	l := newACMMForceRefreshLimiter()
	base := time.Now()

	allowed, _ := l.Allow("user-x:owner/repo", base)
	require.True(t, allowed)

	within := base.Add(acmmForceRefreshCooldown + time.Second)
	require.Less(t, within.Sub(base), acmmForceRefreshRecordTTL,
		"guard: TTL must exceed cooldown for this test to be meaningful")

	allowed, _ = l.Allow("user-y:owner/repo", within)
	assert.True(t, allowed)

	l.mu.Lock()
	_, xPresent := l.lastRequest["user-x:owner/repo"]
	_, yPresent := l.lastRequest["user-y:owner/repo"]
	size := len(l.lastRequest)
	l.mu.Unlock()

	assert.True(t, xPresent, "record within TTL must be kept by purgeExpired")
	assert.True(t, yPresent, "newly recorded key must be present")
	assert.Equal(t, 2, size, "no entries should have been deleted")
}

// TestACMMForceRefreshKey_IPFallbackWhenNoUserID covers the uncovered
// fallback arm at pkg/api/handlers/compliance/acmm_scan.go:133 — when
// middleware.GetUserID returns uuid.Nil (unauthenticated request), the
// key is derived from c.IP() + ":" + repo instead of a user UUID.
//
// The existing rate-limit tests always inject a userID via c.Locals, so
// this arm was never taken. Regression risk: if it broke (e.g. returned
// ":" + repo with an empty prefix), two anonymous clients from different
// IPs would share one rate-limit bucket, letting one trivially DoS
// force-refresh for the entire instance.
func TestACMMForceRefreshKey_IPFallbackWhenNoUserID(t *testing.T) {
	app := fiber.New()

	const repo = "acme/widget"
	var gotKey string

	app.Get("/probe", func(c *fiber.Ctx) error {
		gotKey = acmmForceRefreshKey(c, repo)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, resp.StatusCode)

	nilPrefix := uuid.Nil.String() + ":"
	assert.NotEmpty(t, gotKey, "key must be non-empty in the IP-fallback arm")
	assert.NotContains(t, gotKey, nilPrefix,
		"IP-fallback arm must not stringify uuid.Nil as the key prefix (would happen if the userID branch fired anyway)")
	assert.Contains(t, gotKey, ":"+repo,
		"IP-fallback arm must still suffix the repo after the IP")
}

// TestACMMForceRefreshKey_UsesUserIDWhenPresent is the paired positive
// case: when a userID is on the context, the key must be
// "<uuid>:<repo>". Already partly exercised by the existing rate-limit
// tests, but they only check RATE-LIMITING behavior; nothing currently
// asserts the key's exact composition. Locking it down here guards
// against a refactor that accidentally swapped the order to "<repo>:<uuid>"
// or dropped one component — either would silently break the per-user
// isolation without any existing test failing.
func TestACMMForceRefreshKey_UsesUserIDWhenPresent(t *testing.T) {
	app := fiber.New()

	const repo = "acme/widget"
	userID := uuid.New()
	var gotKey string

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/probe", func(c *fiber.Ctx) error {
		gotKey = acmmForceRefreshKey(c, repo)
		return c.SendString("ok")
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, resp.StatusCode)

	assert.Equal(t, userID.String()+":"+repo, gotKey,
		"authenticated key must be exactly '<uuid>:<repo>' in this order")
}
