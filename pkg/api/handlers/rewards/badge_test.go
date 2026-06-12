package rewards

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeBadgeFetcher is a test double for badgeRewardsFetcher.
type fakeBadgeFetcher struct {
	points   map[string]int
	unknown  map[string]bool
	errorFor map[string]error
	lastHit  bool
	calls    int
}

func (f *fakeBadgeFetcher) fetchUserRewardsForBadge(_ context.Context, login string) (*GitHubRewardsResponse, bool, error) {
	f.calls++
	if err, ok := f.errorFor[login]; ok {
		return nil, f.lastHit, err
	}
	if f.unknown[login] {
		return nil, f.lastHit, errBadgeUnknownLogin
	}
	if pts, ok := f.points[login]; ok {
		return &GitHubRewardsResponse{TotalPoints: pts}, f.lastHit, nil
	}
	return nil, f.lastHit, errBadgeUnknownLogin
}

// TestBadgeGetBadge verifies the public contributor badge endpoint, including
// SVG rendering, iconography, and the privacy guard (#8862 Phase 2, 4, 5).
func TestBadgeGetBadge(t *testing.T) {
	app := fiber.New()
	mockFetcher := &fakeBadgeFetcher{
		points:   make(map[string]int),
		unknown:  make(map[string]bool),
		errorFor: make(map[string]error),
	}
	mockStore := new(test.MockStore)
	handler := NewBadgeHandler(mockFetcher, mockStore)
	app.Get("/api/rewards/badge/:github_login", handler.GetBadge)

	t.Run("Success_EngagedUser", func(t *testing.T) {
		mockFetcher.calls = 0
		mockFetcher.points["engaged-user"] = 20000 // Commander

		mockStore.On("GetUserByGitHubLogin", "engaged-user").Return(&models.User{GitHubLogin: "engaged-user", GitHubID: "gh-1"}, nil).Once()
		mockStore.On("GetUserRewards", "gh-1").Return(&store.UserRewards{Coins: 0}, nil).Once()

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/engaged-user", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, badgeContentType, resp.Header.Get(fiber.HeaderContentType))

		body, _ := io.ReadAll(resp.Body)
		svg := string(body)
		assert.Contains(t, svg, "kubestellar")
		assert.Contains(t, svg, "Commander")
		assert.Contains(t, svg, "#8b5cf6")
		assert.Contains(t, svg, "<path fill=\"#fff\" d=\"M20 13c0 5-3.5 7.5-7.66 8.95")
		assert.Equal(t, 1, mockFetcher.calls)
	})

	t.Run("PrivacyGuard_UnknownUser", func(t *testing.T) {
		mockFetcher.calls = 0
		mockStore.On("GetUserByGitHubLogin", "stranger").Return(nil, nil).Once()

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/stranger", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		svg := string(body)
		assert.Contains(t, svg, "unknown")
		assert.Contains(t, svg, badgeUnknownTierColor)
		assert.Equal(t, 0, mockFetcher.calls)
	})

	t.Run("Success_Legend", func(t *testing.T) {
		mockFetcher.calls = 0
		mockFetcher.points["top-tier"] = 600000
		mockStore.On("GetUserByGitHubLogin", "top-tier").Return(&models.User{GitHubLogin: "top-tier", GitHubID: "gh-2"}, nil).Once()
		mockStore.On("GetUserRewards", "gh-2").Return(&store.UserRewards{Coins: 0}, nil).Once()

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/top-tier", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		svg := string(body)
		assert.Contains(t, svg, "Legend")
		assert.Contains(t, svg, "#f59e0b")
		assert.Contains(t, svg, "d=\"m12 3-1.912 5.813")
	})

	t.Run("Success_CombinedPoints", func(t *testing.T) {
		mockFetcher.calls = 0
		mockFetcher.points["combo-user"] = 5000

		mockStore.On("GetUserByGitHubLogin", "combo-user").Return(&models.User{GitHubLogin: "combo-user", GitHubID: "gh-combo"}, nil).Once()
		mockStore.On("GetUserRewards", "gh-combo").Return(&store.UserRewards{
			Coins:       4000,
			BonusPoints: 1000,
		}, nil).Once()

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/combo-user", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		svg := string(body)
		assert.Contains(t, svg, "Pilot")
		assert.Contains(t, svg, "#10b981")
		assert.Contains(t, svg, "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2")
	})

	t.Run("Error_StoreFailed", func(t *testing.T) {
		mockStore.On("GetUserByGitHubLogin", "db-error").Return(nil, errors.New("query failed")).Once()

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/db-error", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		assert.Contains(t, string(body), "error")
		assert.Contains(t, string(body), badgeErrorTierColor)
	})

	t.Run("Error_UpstreamFailed", func(t *testing.T) {
		mockStore.On("GetUserByGitHubLogin", "api-error").Return(&models.User{GitHubLogin: "api-error", GitHubID: "gh-3"}, nil).Once()
		mockFetcher.errorFor["api-error"] = errors.New("github down")

		req := httptest.NewRequest(http.MethodGet, "/api/rewards/badge/api-error", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
	})
}

func TestTierColorHex_AllKnownColors(t *testing.T) {
	knownColors := []string{"gray", "blue", "cyan", "green", "purple", "orange", "red", "yellow"}
	for _, c := range knownColors {
		hex := tierColorHex(c)
		assert.NotEmpty(t, hex)
		assert.True(t, strings.HasPrefix(hex, "#"))
	}
	assert.Equal(t, badgeUnknownTierColor, tierColorHex("not-a-real-color"))
}
