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

const (
	stellarTestFiberTimeoutMs = 5000
	stellarTestEventWait      = 100 * time.Millisecond
)

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
	require.NoError(t, sqlStore.UpdateStellarPreferences(context.Background(), &store.StellarPreferences{
		UserID:          testUserID.String(),
		DefaultProvider: "auto",
		ExecutionMode:   "hybrid",
		Timezone:        "UTC",
		ProactiveMode:   true,
		PinnedClusters:  []string{},
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
	app.Post("/api/stellar/notifications/:id/investigate", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)
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

func TestBroadcastToClientsScopesEventsByUser(t *testing.T) {
	h := NewStellarHandler(nil, nil)

	userChannel := make(chan SSEEvent, 4)
	otherChannel := make(chan SSEEvent, 4)
	adminChannel := make(chan SSEEvent, 4)

	h.registerSSEClient("user", "user-a", false, userChannel)
	h.registerSSEClient("other", "user-b", false, otherChannel)
	h.registerSSEClient("admin", "admin-user", true, adminChannel)

	h.broadcastToClients(SSEEvent{Type: "notification", Data: &store.StellarNotification{UserID: "user-a", Title: "owned"}})
	require.Eventually(t, func() bool { return len(userChannel) == 1 }, stellarTestEventWait, 10*time.Millisecond)
	require.Eventually(t, func() bool { return len(adminChannel) == 1 }, stellarTestEventWait, 10*time.Millisecond)
	assert.Len(t, otherChannel, 0)

	assert.Equal(t, "notification", (<-userChannel).Type)
	assert.Equal(t, "notification", (<-adminChannel).Type)

	h.broadcastToClients(newUserScopedSSEEvent("user-b", "action_update", map[string]string{"id": "a1", "status": "done"}))
	require.Eventually(t, func() bool { return len(otherChannel) == 1 }, stellarTestEventWait, 10*time.Millisecond)
	require.Eventually(t, func() bool { return len(adminChannel) == 1 }, stellarTestEventWait, 10*time.Millisecond)
	assert.Len(t, userChannel, 0)

	assert.Equal(t, "action_update", (<-otherChannel).Type)
	assert.Equal(t, "action_update", (<-adminChannel).Type)

	h.broadcastToClients(SSEEvent{Type: "notification", Data: &store.StellarNotification{UserID: stellarSystemUserID, Title: "system"}})
	require.Eventually(t, func() bool { return len(adminChannel) == 1 }, stellarTestEventWait, 10*time.Millisecond)
	assert.Len(t, userChannel, 0)
	assert.Len(t, otherChannel, 0)
	assert.Equal(t, "notification", (<-adminChannel).Type)
}

func TestStellarNotificationStateTransitions(t *testing.T) {
	app, st := newStellarTestApp(t)
	sqlStore, ok := st.(*store.SQLiteStore)
	require.True(t, ok)

	items, err := sqlStore.ListStellarUserIDs(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, items)
	userID := items[0]

	notification := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "critical",
		Title:     "CrashLoopBackOff — default/api-7c9d",
		Body:      "timeout after 30s waiting for DB pool",
		Cluster:   "prod-a",
		Namespace: "default",
		DedupeKey: "ev:Pod:api-7c9d",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), notification))

	investigateReq, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+notification.ID+"/investigate", bytes.NewReader([]byte(`{"investigationSummary":"pulling logs"}`)))
	require.NoError(t, err)
	investigateReq.Header.Set("Content-Type", "application/json")
	investigateResp, err := app.Test(investigateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, investigateResp.StatusCode)

	var investigating store.StellarNotification
	require.NoError(t, json.NewDecoder(investigateResp.Body).Decode(&investigating))
	assert.Equal(t, "investigating", investigating.Status)
	assert.Equal(t, "pulling logs", investigating.InvestigationSummary)
	assert.False(t, investigating.Read)

	resolveReq, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+notification.ID+"/resolve", bytes.NewReader([]byte(`{"resolutionNote":"restarted deployment"}`)))
	require.NoError(t, err)
	resolveReq.Header.Set("Content-Type", "application/json")
	resolveResp, err := app.Test(resolveReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resolveResp.StatusCode)

	var resolved store.StellarNotification
	require.NoError(t, json.NewDecoder(resolveResp.Body).Decode(&resolved))
	assert.Equal(t, "resolved", resolved.Status)
	assert.Equal(t, "restarted deployment", resolved.ResolutionNote)
	assert.True(t, resolved.Read)
	assert.NotNil(t, resolved.BatchTimestamp)

	notification2 := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "FailedScheduling — default/api",
		Body:      "insufficient cpu",
		Cluster:   "prod-a",
		Namespace: "default",
		DedupeKey: "ev:Pod:api",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), notification2))

	dismissReq, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+notification2.ID+"/dismiss", bytes.NewReader([]byte(`{"dismissalReason":"duplicate event"}`)))
	require.NoError(t, err)
	dismissReq.Header.Set("Content-Type", "application/json")
	dismissResp, err := app.Test(dismissReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, dismissResp.StatusCode)

	var dismissed store.StellarNotification
	require.NoError(t, json.NewDecoder(dismissResp.Body).Decode(&dismissed))
	assert.Equal(t, "dismissed", dismissed.Status)
	assert.Equal(t, "duplicate event", dismissed.DismissalReason)
	assert.True(t, dismissed.Read)
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
