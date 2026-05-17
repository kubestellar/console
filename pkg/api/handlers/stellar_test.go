package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const stellarTestFiberTimeoutMs = 5000

func newStellarTestApp(t *testing.T) (*fiber.App, store.Store) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })
	testUserID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          testUserID,
		GitHubLogin: "stellar-test-user",
		Role:        models.UserRoleAdmin,
	}))

	ollamaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/tags":
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3:latest"}]}`))
		case "/api/chat":
			_, _ = w.Write([]byte(`{"message":{"content":"Test answer"},"prompt_eval_count":5,"eval_count":10,"model":"llama3:latest"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ollamaServer.Close)
	t.Setenv("OLLAMA_BASE_URL", ollamaServer.URL)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testUserID)
		c.Locals("githubLogin", "stellar-test-user")
		return c.Next()
	})

	h := NewStellarHandler(sqlStore, nil)
	app.Get("/api/stellar/preferences", h.GetPreferences)
	app.Put("/api/stellar/preferences", h.UpdatePreferences)
	app.Get("/api/stellar/missions", h.ListMissions)
	app.Get("/api/stellar/missions/:id", h.GetMission)
	app.Post("/api/stellar/missions", h.CreateMission)
	app.Put("/api/stellar/missions/:id", h.UpdateMission)
	app.Delete("/api/stellar/missions/:id", h.DeleteMission)
	app.Get("/api/stellar/actions", h.ListActions)
	app.Post("/api/stellar/actions", h.CreateAction)
	app.Post("/api/stellar/actions/:id/approve", h.ApproveAction)
	app.Get("/api/stellar/state", h.GetState)
	app.Get("/api/stellar/digest", h.GetDigest)
	app.Post("/api/stellar/ask", h.Ask)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Get("/api/stellar/watches", h.ListWatches)
	app.Post("/api/stellar/watches", h.CreateWatch)
	app.Post("/api/stellar/watches/:id/resolve", h.ResolveWatch)

	return app, sqlStore
}

func TestStellarPreferencesRoundTrip(t *testing.T) {
	app, _ := newStellarTestApp(t)

	getReq, err := http.NewRequest(http.MethodGet, "/api/stellar/preferences", nil)
	require.NoError(t, err)
	getResp, err := app.Test(getReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, getResp.StatusCode)
	var defaults map[string]any
	require.NoError(t, json.NewDecoder(getResp.Body).Decode(&defaults))
	assert.Equal(t, "hybrid", defaults["executionMode"])
	assert.Equal(t, true, defaults["proactiveMode"])

	updateBody := map[string]any{
		"defaultProvider": "ollama",
		"executionMode":   "local-only",
		"timezone":        "Asia/Kolkata",
		"proactiveMode":   false,
		"pinnedClusters":  []string{"prod-a", "staging-a"},
	}
	raw, _ := json.Marshal(updateBody)
	putReq, err := http.NewRequest(http.MethodPut, "/api/stellar/preferences", bytes.NewReader(raw))
	require.NoError(t, err)
	putReq.Header.Set("Content-Type", "application/json")
	putResp, err := app.Test(putReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, putResp.StatusCode)
}

func TestStellarMissionAndActionFlow(t *testing.T) {
	app, _ := newStellarTestApp(t)

	createMissionBody := map[string]any{
		"name":           "overnight-watch",
		"goal":           "Watch production overnight and summarize drift, failures, and alerts.",
		"schedule":       "0 1 * * *",
		"triggerType":    "cron",
		"providerPolicy": "hybrid-fallback",
		"memoryScope":    "mission",
		"enabled":        true,
		"toolBindings":   []string{"kubernetes", "prometheus"},
	}
	rawMission, _ := json.Marshal(createMissionBody)
	createMissionReq, err := http.NewRequest(http.MethodPost, "/api/stellar/missions", bytes.NewReader(rawMission))
	require.NoError(t, err)
	createMissionReq.Header.Set("Content-Type", "application/json")
	createMissionResp, err := app.Test(createMissionReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, createMissionResp.StatusCode)

	scheduledAt := time.Now().UTC().Add(-1 * time.Minute).Format(time.RFC3339)
	createActionBody := map[string]any{
		"description": "Scale worker deployment",
		"actionType":  "ScaleDeployment",
		"parameters": map[string]any{
			"deployment": "worker",
			"replicas":   5,
		},
		"cluster":     "prod-a",
		"namespace":   "default",
		"scheduledAt": scheduledAt,
	}
	rawAction, _ := json.Marshal(createActionBody)
	createActionReq, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader(rawAction))
	require.NoError(t, err)
	createActionReq.Header.Set("Content-Type", "application/json")
	createActionResp, err := app.Test(createActionReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, createActionResp.StatusCode)
	var createdAction map[string]any
	require.NoError(t, json.NewDecoder(createActionResp.Body).Decode(&createdAction))
	actionID, ok := createdAction["id"].(string)
	require.True(t, ok)
	require.NotEmpty(t, actionID)

	approveReq, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/approve", bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	approveReq.Header.Set("Content-Type", "application/json")
	approveResp, err := app.Test(approveReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, approveResp.StatusCode)
}

func TestStellarAskStateDigestAndNotifications(t *testing.T) {
	app, _ := newStellarTestApp(t)

	askBody := map[string]any{
		"prompt": "What should I look at first?",
	}
	rawAsk, _ := json.Marshal(askBody)
	askReq, err := http.NewRequest(http.MethodPost, "/api/stellar/ask", bytes.NewReader(rawAsk))
	require.NoError(t, err)
	askReq.Header.Set("Content-Type", "application/json")
	askResp, err := app.Test(askReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, askResp.StatusCode)

	stateReq, err := http.NewRequest(http.MethodGet, "/api/stellar/state", nil)
	require.NoError(t, err)
	stateResp, err := app.Test(stateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, stateResp.StatusCode)

	digestReq, err := http.NewRequest(http.MethodGet, "/api/stellar/digest", nil)
	require.NoError(t, err)
	digestResp, err := app.Test(digestReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, digestResp.StatusCode)

	notifReq, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)
	notifResp, err := app.Test(notifReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, notifResp.StatusCode)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(notifResp.Body).Decode(&payload))
	items, _ := payload["items"].([]any)
	if len(items) > 0 {
		item, _ := items[0].(map[string]any)
		id, _ := item["id"].(string)
		if id != "" {
			readReq, reqErr := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+id+"/read", nil)
			require.NoError(t, reqErr)
			readResp, readErr := app.Test(readReq, stellarTestFiberTimeoutMs)
			require.NoError(t, readErr)
			require.Equal(t, http.StatusNoContent, readResp.StatusCode)
		}
	}
}

func TestStellarResolveWatchReturnsJSON(t *testing.T) {
	app, _ := newStellarTestApp(t)

	createBody := map[string]any{
		"cluster":      "prod-a",
		"namespace":    "default",
		"resourceKind": "Deployment",
		"resourceName": "api",
		"reason":       "recurring failures",
	}
	rawCreate, _ := json.Marshal(createBody)
	createReq, err := http.NewRequest(http.MethodPost, "/api/stellar/watches", bytes.NewReader(rawCreate))
	require.NoError(t, err)
	createReq.Header.Set("Content-Type", "application/json")
	createResp, err := app.Test(createReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(createResp.Body).Decode(&created))
	watchID, ok := created["id"].(string)
	require.True(t, ok)
	require.NotEmpty(t, watchID)

	resolveReq, err := http.NewRequest(http.MethodPost, "/api/stellar/watches/"+watchID+"/resolve", bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	resolveReq.Header.Set("Content-Type", "application/json")
	resolveResp, err := app.Test(resolveReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resolveResp.StatusCode)

	var resolved map[string]any
	require.NoError(t, json.NewDecoder(resolveResp.Body).Decode(&resolved))
	assert.Equal(t, watchID, resolved["id"])
	assert.Equal(t, "resolved", resolved["status"])
	assert.NotNil(t, resolved["inactivityTimeoutMs"])
}
