package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

// testRewardsFiberTimeoutMs is the read timeout (ms) used when invoking the
// Fiber test router. 5 seconds is the same value the GPU handler tests use.
const testRewardsFiberTimeoutMs = 5000

// newRewardsTestApp builds a Fiber app backed by a real on-disk SQLite
// store and wired to the persistence handlers. Tests run against real
// SQL so the prepared statements, schema, and transaction logic are all
// exercised end-to-end (the mock-store path is covered separately by the
// store tests themselves).
func newRewardsTestApp(t *testing.T) (*fiber.App, store.Store, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "rewards-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { sqlStore.Close() })

	const testUserID = "rewards-handler-user"

	app := fiber.New()
	// Inject a stable reward key into locals for every request so the
	// handler's resolver short-circuits on the GitHub-login branch (the
	// UUID zero-check then falls through to "githubLogin").
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("githubLogin", testUserID)
		return c.Next()
	})

	h := NewRewardsPersistenceHandler(sqlStore)
	app.Get("/api/rewards/me", h.GetUserRewards)
	app.Put("/api/rewards/me", h.UpdateUserRewards)
	app.Post("/api/rewards/coins", h.IncrementCoins)
	app.Post("/api/rewards/daily-bonus", h.ClaimDailyBonus)

	return app, sqlStore, testUserID
}

func decodeRewardsResponse(t *testing.T, resp *http.Response) userRewardsResponse {
	t.Helper()
	defer resp.Body.Close()
	var body userRewardsResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	return body
}

func TestRewardsHandler_GetReturnsZeroForNewUser(t *testing.T) {
	app, _, userID := newRewardsTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/rewards/me", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body := decodeRewardsResponse(t, resp)
	assert.Equal(t, userID, body.UserID)
	assert.Equal(t, 0, body.Coins)
	assert.Equal(t, 0, body.Points)
	assert.Equal(t, store.DefaultUserLevel, body.Level)
	assert.Equal(t, 0, body.BonusPoints)
	assert.Empty(t, body.LastDailyBonusAt)
}

func TestRewardsHandler_PutThenGetRoundTrip(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	const (
		wantCoins  = 75
		wantPoints = 200
		wantLevel  = 4
		wantBonus  = 10
	)

	payload, err := json.Marshal(map[string]int{
		"coins":        wantCoins,
		"points":       wantPoints,
		"level":        wantLevel,
		"bonus_points": wantBonus,
	})
	require.NoError(t, err)

	putReq, err := http.NewRequest(http.MethodPut, "/api/rewards/me", bytes.NewReader(payload))
	require.NoError(t, err)
	putReq.Header.Set("Content-Type", "application/json")
	putResp, err := app.Test(putReq, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, putResp.StatusCode)
	putBody := decodeRewardsResponse(t, putResp)
	assert.Equal(t, wantCoins, putBody.Coins)

	getReq, err := http.NewRequest(http.MethodGet, "/api/rewards/me", nil)
	require.NoError(t, err)
	getResp, err := app.Test(getReq, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, getResp.StatusCode)
	getBody := decodeRewardsResponse(t, getResp)
	assert.Equal(t, wantCoins, getBody.Coins)
	assert.Equal(t, wantPoints, getBody.Points)
	assert.Equal(t, wantLevel, getBody.Level)
	assert.Equal(t, wantBonus, getBody.BonusPoints)
}

func TestRewardsHandler_PutRejectsOutOfRangeValues(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	const negativeCoins = -10
	payload, err := json.Marshal(map[string]int{"coins": negativeCoins})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPut, "/api/rewards/me", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRewardsHandler_PostCoinsIncrementsCorrectly(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	const firstDelta = 10
	const secondDelta = 5
	const wantAfterTwoCalls = firstDelta + secondDelta

	postDelta := func(delta int) userRewardsResponse {
		payload, err := json.Marshal(map[string]int{"delta": delta})
		require.NoError(t, err)
		req, err := http.NewRequest(http.MethodPost, "/api/rewards/coins", bytes.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, testRewardsFiberTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		return decodeRewardsResponse(t, resp)
	}

	first := postDelta(firstDelta)
	assert.Equal(t, firstDelta, first.Coins)
	second := postDelta(secondDelta)
	assert.Equal(t, wantAfterTwoCalls, second.Coins)
}

func TestRewardsHandler_PostCoinsNegativeDoesNotDriveBelowZero(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	// Starting balance is zero; a -5 delta should clamp to MinCoinBalance.
	const subtract = -5
	payload, err := json.Marshal(map[string]int{"delta": subtract})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, "/api/rewards/coins", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	body := decodeRewardsResponse(t, resp)
	assert.Equal(t, store.MinCoinBalance, body.Coins)
}

func TestRewardsHandler_PostCoinsRejectsZeroDelta(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	payload, err := json.Marshal(map[string]int{"delta": 0})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, "/api/rewards/coins", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRewardsHandler_PostCoinsRejectsOversizedDelta(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	// One above the per-request ceiling
	payload, err := json.Marshal(map[string]int{"delta": maxCoinDeltaPerRequest + 1})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, "/api/rewards/coins", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRewardsHandler_DailyBonusFirstClaimSucceeds(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/rewards/daily-bonus", nil)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

// TestRewardsHandler_DailyBonusSecondClaimReturns429 exercises the cooldown
// enforcement via the real SQLite store. Because ClaimDailyBonus is called
// with time.Now() inside the handler we cannot time-travel here, so this
// test relies on the second call happening within milliseconds of the
// first — which is well below the dailyBonusIntervalHours window.
func TestRewardsHandler_DailyBonusSecondClaimReturns429(t *testing.T) {
	app, _, _ := newRewardsTestApp(t)

	req1, err := http.NewRequest(http.MethodPost, "/api/rewards/daily-bonus", nil)
	require.NoError(t, err)
	resp1, err := app.Test(req1, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp1.StatusCode)
	resp1.Body.Close()

	req2, err := http.NewRequest(http.MethodPost, "/api/rewards/daily-bonus", nil)
	require.NoError(t, err)
	resp2, err := app.Test(req2, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusTooManyRequests, resp2.StatusCode)
	resp2.Body.Close()
}

func TestRewardsHandler_UnauthenticatedReturns401(t *testing.T) {
	// Build an app WITHOUT the githubLogin middleware so the resolver
	// returns an empty string and every endpoint should answer 401.
	dbPath := filepath.Join(t.TempDir(), "rewards-unauth.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { sqlStore.Close() })

	app := fiber.New()
	h := NewRewardsPersistenceHandler(sqlStore)
	app.Get("/api/rewards/me", h.GetUserRewards)
	app.Put("/api/rewards/me", h.UpdateUserRewards)
	app.Post("/api/rewards/coins", h.IncrementCoins)
	app.Post("/api/rewards/daily-bonus", h.ClaimDailyBonus)

	getReq, _ := http.NewRequest(http.MethodGet, "/api/rewards/me", nil)
	resp, err := app.Test(getReq, testRewardsFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
