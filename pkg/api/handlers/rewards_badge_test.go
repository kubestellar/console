package handlers

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeBadgeFetcher is a test double for badgeRewardsFetcher. The handler
// only needs three distinct outcomes — success with a point total, unknown
// login, and upstream error — so a struct of canned responses keyed by
// login is enough without pulling in a mocking library.
type fakeBadgeFetcher struct {
	points   map[string]int
	unknown  map[string]bool
	errorFor map[string]error
	lastHit  bool // cache_hit value to return for the next call
}

func (f *fakeBadgeFetcher) fetchUserRewardsForBadge(login string) (*GitHubRewardsResponse, bool, error) {
	if err, ok := f.errorFor[login]; ok {
		return nil, f.lastHit, err
	}
	if f.unknown[login] {
		return nil, f.lastHit, errBadgeUnknownLogin
	}
	if pts, ok := f.points[login]; ok {
		return &GitHubRewardsResponse{TotalPoints: pts}, f.lastHit, nil
	}
	// Default to unknown so a missing test setup is obvious.
	return nil, f.lastHit, errBadgeUnknownLogin
}

// newBadgeTestApp builds a bare Fiber app with just the badge route. The
// real server.go mounts publicLimiter — we skip it here because we're
// testing the handler, not the rate limit middleware (which is covered by
// the existing publicLimiter tests).
func newBadgeTestApp(fetcher badgeRewardsFetcher) *fiber.App {
	app := fiber.New()
	h := NewBadgeHandler(fetcher)
	app.Get("/api/rewards/badge/:github_login", h.GetBadge)
	return app
}

// ---------- success path: known login renders tier SVG ----------

func TestBadgeHandler_KnownLogin_RendersTierSVG(t *testing.T) {
	// 5000 coins → Pilot (see pkg/rewards/tiers.go).
	const pilotCoins = 5000
	const expectedTierName = "Pilot"

	fetcher := &fakeBadgeFetcher{
		points:  map[string]int{"alice": pilotCoins},
		lastHit: false,
	}
	app := newBadgeTestApp(fetcher)

	req, err := http.NewRequest("GET", "/api/rewards/badge/alice", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, badgeContentType, resp.Header.Get(fiber.HeaderContentType))
	assert.Equal(t, badgeCacheControlSuccess, resp.Header.Get(fiber.HeaderCacheControl))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	svg := string(body)
	assert.True(t, strings.HasPrefix(svg, "<svg "), "response should start with <svg: %s", svg[:min(len(svg), 40)])
	assert.Contains(t, svg, expectedTierName, "SVG should embed the tier name")
	assert.Contains(t, svg, badgeLabelText, "SVG should embed the label segment")
}

// ---------- unknown login fallback ----------

func TestBadgeHandler_UnknownLogin_RendersUnknownSVG(t *testing.T) {
	fetcher := &fakeBadgeFetcher{
		unknown: map[string]bool{"nobody": true},
	}
	app := newBadgeTestApp(fetcher)

	req, err := http.NewRequest("GET", "/api/rewards/badge/nobody", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"unknown-login fallback must still return 200 so Camo caches the SVG")
	assert.Equal(t, badgeContentType, resp.Header.Get(fiber.HeaderContentType))
	assert.Equal(t, badgeCacheControlSuccess, resp.Header.Get(fiber.HeaderCacheControl))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	svg := string(body)
	assert.Contains(t, svg, badgeUnknownTierName, "SVG should use the unknown tier name")
}

// ---------- upstream 5xx / timeout ----------

func TestBadgeHandler_UpstreamError_RendersErrorSVGNoStore(t *testing.T) {
	fetcher := &fakeBadgeFetcher{
		errorFor: map[string]error{
			"broken": errors.New("upstream 503: service unavailable"),
		},
	}
	app := newBadgeTestApp(fetcher)

	req, err := http.NewRequest("GET", "/api/rewards/badge/broken", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode,
		"upstream error must surface as 502 so clients can distinguish from unknown-login")
	assert.Equal(t, badgeContentType, resp.Header.Get(fiber.HeaderContentType))
	assert.Equal(t, badgeCacheControlError, resp.Header.Get(fiber.HeaderCacheControl))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	svg := string(body)
	assert.Contains(t, svg, badgeErrorTierName, "SVG should use the error tier name")
}

// ---------- cache_hit plumbing ----------

func TestBadgeHandler_CacheHit_StillRendersOK(t *testing.T) {
	// A cache-hit flip is a separate signal from the response body — the
	// handler must still render a 200 SVG whether cache_hit is true or
	// false. Regression guard against a future refactor that accidentally
	// short-circuits the render path when the fetcher reports a cache hit.
	const observerCoins = 0 // 0 coins → Observer tier
	const expectedTierName = "Observer"

	fetcher := &fakeBadgeFetcher{
		points:  map[string]int{"carol": observerCoins},
		lastHit: true,
	}
	app := newBadgeTestApp(fetcher)

	req, err := http.NewRequest("GET", "/api/rewards/badge/carol", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), expectedTierName)
}

// ---------- tier color fallback ----------

func TestTierColorHex_AllKnownColors(t *testing.T) {
	// Every Tailwind color-family name listed on ContributorLevels must map
	// to a non-empty hex string. Drift here would surface the unknown-gray
	// fallback on a valid tier, which is a subtle visual regression.
	knownColors := []string{"gray", "blue", "cyan", "green", "purple", "orange", "red", "yellow"}
	for _, c := range knownColors {
		hex := tierColorHex(c)
		assert.NotEmpty(t, hex, "color %q must have a hex mapping", c)
		assert.True(t, strings.HasPrefix(hex, "#"), "color %q mapped to %q; expected #-prefixed hex", c, hex)
	}

	// An unrecognized family falls back to the unknown-badge gray, never
	// to an empty string.
	fallback := tierColorHex("not-a-real-color")
	assert.Equal(t, badgeUnknownTierColor, fallback)
}
