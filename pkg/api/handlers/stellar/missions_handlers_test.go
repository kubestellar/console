package stellar

// Handler-level tests for pkg/api/handlers/stellar/missions.go.
//
// Companion to missions_test.go (which covers only parseMissionPayload) —
// this file covers the ListMissions / GetMission / CreateMission /
// UpdateMission / DeleteMission HTTP handlers end-to-end against the real
// SQLiteStore.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const stellarMissionHandlerTestTimeoutMs = 5000

func newMissionsHandlerTestApp(t *testing.T) (*fiber.App, *store.SQLiteStore, string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "stellar-missions-handlers.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	userID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "missions-handler-test-user",
		Role:        models.UserRoleEditor,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/missions", h.ListMissions)
	app.Get("/api/stellar/missions/:id", h.GetMission)
	app.Post("/api/stellar/missions", h.CreateMission)
	app.Put("/api/stellar/missions/:id", h.UpdateMission)
	app.Delete("/api/stellar/missions/:id", h.DeleteMission)

	return app, sqlStore, userID.String()
}

func newMissionsHandlerTestAppNoAuth(t *testing.T) *fiber.App {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "stellar-missions-handlers-noauth.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	// No auth middleware — every handler should short-circuit at requireUser.
	h := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/missions", h.ListMissions)
	app.Get("/api/stellar/missions/:id", h.GetMission)
	app.Post("/api/stellar/missions", h.CreateMission)
	app.Put("/api/stellar/missions/:id", h.UpdateMission)
	app.Delete("/api/stellar/missions/:id", h.DeleteMission)
	return app
}

func doJSON(t *testing.T, app *fiber.App, method, path string, body any) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, path, reader)
	require.NoError(t, err)
	req.Host = "localhost"
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Test(req, stellarMissionHandlerTestTimeoutMs)
	require.NoError(t, err)
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	var out map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

// ---------------------------------------------------------------------------
// ListMissions
// ---------------------------------------------------------------------------

func TestListMissions_EmptyResult(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)

	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions", nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok, "items array is required")
	assert.Empty(t, items)
	// limit is always echoed and must be a positive number.
	limit, ok := payload["limit"].(float64)
	require.True(t, ok, "limit must be a number")
	assert.Greater(t, limit, 0.0)
}

func TestListMissions_ReturnsCreatedMissions(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)

	// Seed two missions directly through the store.
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), &store.StellarMission{
		UserID: userID, Name: "alpha", Goal: "watch alpha", TriggerType: "manual",
	}))
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), &store.StellarMission{
		UserID: userID, Name: "beta", Goal: "watch beta", TriggerType: "cron", Schedule: "0 * * * *",
	}))

	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions", nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 2)
}

func TestListMissions_ScopedByUser(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)

	// This user's mission.
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), &store.StellarMission{
		UserID: userID, Name: "mine", Goal: "for me", TriggerType: "manual",
	}))
	// Another user's mission — must not leak into this user's list.
	otherUser := uuid.New().String()
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), &store.StellarMission{
		UserID: otherUser, Name: "theirs", Goal: "for them", TriggerType: "manual",
	}))

	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions", nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items := payload["items"].([]any)
	require.Len(t, items, 1)
	first := items[0].(map[string]any)
	assert.Equal(t, "mine", first["name"])
}

func TestListMissions_Unauthenticated(t *testing.T) {
	app := newMissionsHandlerTestAppNoAuth(t)
	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// GetMission
// ---------------------------------------------------------------------------

func TestGetMission_NotFound(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions/does-not-exist", nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	payload := map[string]any{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "mission not found", payload["error"])
}

func TestGetMission_ReturnsMission(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)

	mission := &store.StellarMission{
		UserID: userID, Name: "watchdog", Goal: "watch everything",
		TriggerType: "manual", ProviderPolicy: "auto", MemoryScope: "user",
		Enabled: true, ToolBindings: []string{"kubernetes"},
	}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))
	require.NotEmpty(t, mission.ID)

	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions/"+mission.ID, nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	payload := map[string]any{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, mission.ID, payload["id"])
	assert.Equal(t, "watchdog", payload["name"])
	assert.Equal(t, "watch everything", payload["goal"])
	assert.Equal(t, true, payload["enabled"])
}

func TestGetMission_ScopedByUser(t *testing.T) {
	app, sqlStore, _ := newMissionsHandlerTestApp(t)

	// Mission owned by a different user — this user must get 404.
	other := &store.StellarMission{
		UserID: uuid.New().String(), Name: "leak-check", Goal: "should not be reachable",
		TriggerType: "manual",
	}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), other))

	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions/"+other.ID, nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestGetMission_Unauthenticated(t *testing.T) {
	app := newMissionsHandlerTestAppNoAuth(t)
	resp := doJSON(t, app, http.MethodGet, "/api/stellar/missions/x", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// CreateMission
// ---------------------------------------------------------------------------

func TestCreateMission_Success(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)

	body := map[string]any{
		"name":           "nightly-sweep",
		"goal":           "check every namespace",
		"schedule":       "0 3 * * *",
		"triggerType":    "cron",
		"providerPolicy": "hybrid-fallback",
		"memoryScope":    "mission",
		"enabled":        true,
		"toolBindings":   []string{"kubernetes", "prometheus"},
	}
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", body)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	payload := decodeJSON(t, resp)
	id, _ := payload["id"].(string)
	require.NotEmpty(t, id, "created mission should have an id")
	assert.Equal(t, "nightly-sweep", payload["name"])
	assert.Equal(t, "cron", payload["triggerType"])
	assert.Equal(t, "hybrid-fallback", payload["providerPolicy"])
	assert.Equal(t, "mission", payload["memoryScope"])
	assert.Equal(t, true, payload["enabled"])

	// Verify persisted via the store.
	loaded, err := sqlStore.GetStellarMission(context.Background(), userID, id)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	assert.Equal(t, "nightly-sweep", loaded.Name)
	assert.Equal(t, []string{"kubernetes", "prometheus"}, loaded.ToolBindings)
}

func TestCreateMission_DefaultsAppliedWhenOmitted(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)

	// Only required fields — defaults for triggerType/providerPolicy/memoryScope.
	body := map[string]any{
		"name": "minimal",
		"goal": "just watch",
	}
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", body)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	payload := decodeJSON(t, resp)
	assert.Equal(t, "manual", payload["triggerType"])
	assert.Equal(t, "auto", payload["providerPolicy"])
	assert.Equal(t, "user", payload["memoryScope"])
}

func TestCreateMission_InvalidJSON(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/missions",
		bytes.NewReader([]byte(`{not json`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarMissionHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_MissingName(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": "   ", "goal": "goal",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_NameTooLong(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": strings.Repeat("x", stellarMaxNameLength+1),
		"goal": "goal",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_MissingGoal(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": "n", "goal": "  ",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_GoalTooLong(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": "n",
		"goal": strings.Repeat("g", stellarMaxGoalLength+1),
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_ScheduleTooLong(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name":     "n",
		"goal":     "g",
		"schedule": strings.Repeat("s", stellarMaxScheduleLength+1),
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_InvalidTriggerType(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name":        "n",
		"goal":        "g",
		"triggerType": "not-a-real-trigger",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_TooManyToolBindings(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	tools := make([]string, stellarMaxToolsPerMission+1)
	for i := range tools {
		tools[i] = "t"
	}
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": "n", "goal": "g", "toolBindings": tools,
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_ToolNameTooLong(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name":         "n",
		"goal":         "g",
		"toolBindings": []string{strings.Repeat("t", stellarMaxToolNameLength+1)},
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateMission_EmptyToolNamesFilteredOut(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name":         "filter-empty-tools",
		"goal":         "g",
		"toolBindings": []string{"kubernetes", "  ", "", "prometheus"},
	})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	payload := decodeJSON(t, resp)
	id := payload["id"].(string)

	loaded, err := sqlStore.GetStellarMission(context.Background(), userID, id)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	assert.Equal(t, []string{"kubernetes", "prometheus"}, loaded.ToolBindings)
}

func TestCreateMission_Unauthenticated(t *testing.T) {
	app := newMissionsHandlerTestAppNoAuth(t)
	resp := doJSON(t, app, http.MethodPost, "/api/stellar/missions", map[string]any{
		"name": "n", "goal": "g",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// UpdateMission
// ---------------------------------------------------------------------------

func createMissionForTest(t *testing.T, sqlStore *store.SQLiteStore, userID, name string) *store.StellarMission {
	t.Helper()
	m := &store.StellarMission{
		UserID: userID, Name: name, Goal: "original goal",
		TriggerType: "manual", ProviderPolicy: "auto", MemoryScope: "user",
	}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), m))
	return m
}

func TestUpdateMission_Success(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)
	m := createMissionForTest(t, sqlStore, userID, "before-update")

	resp := doJSON(t, app, http.MethodPut, "/api/stellar/missions/"+m.ID, map[string]any{
		"name": "after-update", "goal": "new goal", "triggerType": "cron",
		"schedule": "0 4 * * *", "enabled": true,
	})
	require.Equal(t, http.StatusOK, resp.StatusCode)
	payload := decodeJSON(t, resp)
	assert.Equal(t, m.ID, payload["id"])
	assert.Equal(t, "after-update", payload["name"])
	assert.Equal(t, "new goal", payload["goal"])
	assert.Equal(t, "cron", payload["triggerType"])
	assert.Equal(t, true, payload["enabled"])

	loaded, err := sqlStore.GetStellarMission(context.Background(), userID, m.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	assert.Equal(t, "after-update", loaded.Name)
}

func TestUpdateMission_NotFound(t *testing.T) {
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodPut, "/api/stellar/missions/no-such-mission", map[string]any{
		"name": "x", "goal": "y",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestUpdateMission_ScopedByUser(t *testing.T) {
	app, sqlStore, _ := newMissionsHandlerTestApp(t)

	other := createMissionForTest(t, sqlStore, uuid.New().String(), "other-user-mission")

	resp := doJSON(t, app, http.MethodPut, "/api/stellar/missions/"+other.ID, map[string]any{
		"name": "hijack", "goal": "y",
	})
	defer resp.Body.Close()
	// The other user's mission is invisible ⇒ 404 (not 200).
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	// Confirm the mission was not mutated.
	loaded, err := sqlStore.GetStellarMission(context.Background(), other.UserID, other.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	assert.Equal(t, "other-user-mission", loaded.Name)
}

func TestUpdateMission_InvalidPayloadRejected(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)
	m := createMissionForTest(t, sqlStore, userID, "keep-name")

	// Empty name violates parseMissionPayload rules.
	resp := doJSON(t, app, http.MethodPut, "/api/stellar/missions/"+m.ID, map[string]any{
		"name": "  ", "goal": "y",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	// Ensure mission still has original name.
	loaded, err := sqlStore.GetStellarMission(context.Background(), userID, m.ID)
	require.NoError(t, err)
	assert.Equal(t, "keep-name", loaded.Name)
}

func TestUpdateMission_Unauthenticated(t *testing.T) {
	app := newMissionsHandlerTestAppNoAuth(t)
	resp := doJSON(t, app, http.MethodPut, "/api/stellar/missions/x", map[string]any{
		"name": "n", "goal": "g",
	})
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// DeleteMission
// ---------------------------------------------------------------------------

func TestDeleteMission_Success(t *testing.T) {
	app, sqlStore, userID := newMissionsHandlerTestApp(t)
	m := createMissionForTest(t, sqlStore, userID, "to-be-deleted")

	resp := doJSON(t, app, http.MethodDelete, "/api/stellar/missions/"+m.ID, nil)
	defer resp.Body.Close()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	loaded, err := sqlStore.GetStellarMission(context.Background(), userID, m.ID)
	require.NoError(t, err)
	assert.Nil(t, loaded, "mission should be gone after delete")
}

func TestDeleteMission_UnknownIDIsIdempotent(t *testing.T) {
	// SQLite DELETE for a missing row is a no-op — the handler treats that
	// as success (204). This test pins that behavior so future changes to
	// the store don't silently start returning 500 for delete-of-missing.
	app, _, _ := newMissionsHandlerTestApp(t)
	resp := doJSON(t, app, http.MethodDelete, "/api/stellar/missions/does-not-exist", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestDeleteMission_Unauthenticated(t *testing.T) {
	app := newMissionsHandlerTestAppNoAuth(t)
	resp := doJSON(t, app, http.MethodDelete, "/api/stellar/missions/x", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
