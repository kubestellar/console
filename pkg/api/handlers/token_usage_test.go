package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

// testTokenUsageFiberTimeoutMs mirrors the rewards handler tests so the
// Fiber router gives the SQLite read enough time on slow CI runners.
const testTokenUsageFiberTimeoutMs = 5000

// newTokenUsageTestApp builds a Fiber app backed by an on-disk SQLite store
// wired to the token-usage handler. The auth shim sets a stable githubLogin
// local so resolveTokenUsageUserID returns the dev-mode user id.
func newTokenUsageTestApp(t *testing.T) (*fiber.App, store.Store, string, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "token-usage-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { sqlStore.Close() })

	const testUserID = "token-usage-handler-user"

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("githubLogin", testUserID)
		return c.Next()
	})

	h := NewTokenUsageHandler(sqlStore)
	app.Get("/api/token-usage/me", h.GetUserTokenUsage)
	app.Post("/api/token-usage/me", h.UpdateUserTokenUsage)
	app.Post("/api/token-usage/delta", h.AddTokenDelta)

	return app, sqlStore, testUserID, dbPath
}

func decodeTokenUsageResponse(t *testing.T, resp *http.Response) userTokenUsageResponse {
	t.Helper()
	defer resp.Body.Close()
	var body userTokenUsageResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	return body
}

func TestTokenUsageHandler_GetReturnsZeroForNewUser(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/token-usage/me", nil)
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	got := decodeTokenUsageResponse(t, resp)
	assert.Equal(t, int64(0), got.TotalTokens)
	assert.NotNil(t, got.TokensByCategory)
	assert.Equal(t, 0, len(got.TokensByCategory))
	assert.Equal(t, "", got.LastAgentSessionID)
}

func TestTokenUsageHandler_PutThenGetRoundTrip(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	const wantTotal int64 = 1234
	const wantMissions int64 = 800
	const wantDiagnose int64 = 434
	body := putUserTokenUsageRequest{
		TotalTokens: wantTotal,
		TokensByCategory: map[string]int64{
			"missions": wantMissions,
			"diagnose": wantDiagnose,
		},
		LastAgentSessionID: "session-put-1",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/token-usage/me", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	got := decodeTokenUsageResponse(t, resp)
	assert.Equal(t, wantTotal, got.TotalTokens)
	assert.Equal(t, wantMissions, got.TokensByCategory["missions"])
	assert.Equal(t, wantDiagnose, got.TokensByCategory["diagnose"])

	// Re-fetch and confirm persistence.
	getReq, err := http.NewRequest(http.MethodGet, "/api/token-usage/me", nil)
	require.NoError(t, err)
	getResp, err := app.Test(getReq, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	got2 := decodeTokenUsageResponse(t, getResp)
	assert.Equal(t, wantTotal, got2.TotalTokens)
	assert.Equal(t, "session-put-1", got2.LastAgentSessionID)
}

func TestTokenUsageHandler_DeltaIncrementsAtomically(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	const delta1 int64 = 50
	const delta2 int64 = 75
	for _, d := range []int64{delta1, delta2} {
		body, _ := json.Marshal(postTokenDeltaRequest{
			Category:       "missions",
			Delta:          d,
			AgentSessionID: "session-delta-1",
		})
		req, err := http.NewRequest(http.MethodPost, "/api/token-usage/delta", bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode, "delta %d", d)
		resp.Body.Close()
	}

	getReq, err := http.NewRequest(http.MethodGet, "/api/token-usage/me", nil)
	require.NoError(t, err)
	getResp, err := app.Test(getReq, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	got := decodeTokenUsageResponse(t, getResp)
	assert.Equal(t, delta1+delta2, got.TotalTokens)
	assert.Equal(t, delta1+delta2, got.TokensByCategory["missions"])
}

func TestTokenUsageHandler_DeltaSessionChangeSkipsAdd(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	const delta1 int64 = 100
	const delta2 int64 = 250

	// Establish session A and accumulate delta1.
	body1, _ := json.Marshal(postTokenDeltaRequest{
		Category:       "missions",
		Delta:          delta1,
		AgentSessionID: "session-A",
	})
	req1, err := http.NewRequest(http.MethodPost, "/api/token-usage/delta", bytes.NewReader(body1))
	require.NoError(t, err)
	req1.Header.Set("Content-Type", "application/json")
	resp1, err := app.Test(req1, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	resp1.Body.Close()

	// Switch to session B — server must NOT add delta2 to the totals.
	body2, _ := json.Marshal(postTokenDeltaRequest{
		Category:       "missions",
		Delta:          delta2,
		AgentSessionID: "session-B",
	})
	req2, err := http.NewRequest(http.MethodPost, "/api/token-usage/delta", bytes.NewReader(body2))
	require.NoError(t, err)
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := app.Test(req2, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	got := decodeTokenUsageResponse(t, resp2)
	assert.Equal(t, delta1, got.TotalTokens, "session change must skip the delta add")
	assert.Equal(t, "session-B", got.LastAgentSessionID)
}

func TestTokenUsageHandler_GetResetsStaleDayTotals(t *testing.T) {
	app, _, testUserID, dbPath := newTokenUsageTestApp(t)

	body, _ := json.Marshal(putUserTokenUsageRequest{
		TotalTokens: 1000,
		TokensByCategory: map[string]int64{
			"missions": 1000,
		},
		LastAgentSessionID: "session-stale",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/token-usage/me", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	resp.Body.Close()

	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	_, err = db.Exec(`UPDATE user_token_usage SET updated_at = ? WHERE user_id = ?`, time.Now().Add(-24*time.Hour), testUserID)
	require.NoError(t, err)

	getReq, err := http.NewRequest(http.MethodGet, "/api/token-usage/me", nil)
	require.NoError(t, err)
	getResp, err := app.Test(getReq, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	got := decodeTokenUsageResponse(t, getResp)
	assert.Equal(t, int64(0), got.TotalTokens)
	assert.Equal(t, int64(0), got.TokensByCategory["missions"])
	assert.Equal(t, "session-stale", got.LastAgentSessionID)
}

func TestTokenUsageHandler_DeltaRejectsNegative(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	body, _ := json.Marshal(postTokenDeltaRequest{
		Category:       "missions",
		Delta:          -1,
		AgentSessionID: "session-neg",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/token-usage/delta", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

func TestTokenUsageHandler_DeltaRejectsOverLimit(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	body, _ := json.Marshal(postTokenDeltaRequest{
		Category:       "missions",
		Delta:          maxTokenDeltaPerRequest + 1,
		AgentSessionID: "session-big",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/token-usage/delta", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

func TestTokenUsageHandler_PutRejectsTooManyCategories(t *testing.T) {
	app, _, _, _ := newTokenUsageTestApp(t)

	cats := make(map[string]int64, maxTokenCategories+1)
	for i := 0; i <= maxTokenCategories; i++ {
		cats[string(rune('a'+i%26))+string(rune('0'+i/26))] = 1
	}
	body, _ := json.Marshal(putUserTokenUsageRequest{
		TotalTokens:        int64(len(cats)),
		TokensByCategory:   cats,
		LastAgentSessionID: "session-many",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/token-usage/me", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, testTokenUsageFiberTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}
