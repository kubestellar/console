package stellar

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

func newExecutionsTestApp(t *testing.T) (*fiber.App, *store.SQLiteStore, uuid.UUID) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "executions-test-"+uuid.NewString()+".db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = sqlStore.Close()
	})

	testUserID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          testUserID,
		GitHubLogin: "exec-test-user",
		Role:        models.UserRoleViewer,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testUserID)
		return c.Next()
	})

	handler := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/executions", handler.ListExecutions)
	app.Get("/api/stellar/executions/:id", handler.GetExecution)

	return app, sqlStore, testUserID
}

func TestListExecutions_Empty(t *testing.T) {
	app, _, _ := newExecutionsTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items, ok := body["items"].([]interface{})
	require.True(t, ok)
	assert.Empty(t, items)
	assert.NotNil(t, body["limit"])
}

func TestListExecutions_WithData(t *testing.T) {
	app, sqlStore, userID := newExecutionsTestApp(t)

	// Create a mission first
	mission := &store.StellarMission{
		UserID: userID.String(),
		Name:   "test-mission",
		Goal:   "testing",
	}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))

	// Create executions
	exec := &store.StellarExecution{
		UserID:      userID.String(),
		MissionID:   mission.ID,
		TriggerType: "manual",
		Status:      "completed",
	}
	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), exec))

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items, ok := body["items"].([]interface{})
	require.True(t, ok)
	assert.Len(t, items, 1)
}

func TestListExecutions_FilterByMissionID(t *testing.T) {
	app, sqlStore, userID := newExecutionsTestApp(t)

	mission1 := &store.StellarMission{UserID: userID.String(), Name: "m1", Goal: "g1"}
	mission2 := &store.StellarMission{UserID: userID.String(), Name: "m2", Goal: "g2"}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission1))
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission2))

	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), &store.StellarExecution{
		UserID: userID.String(), MissionID: mission1.ID, TriggerType: "manual", Status: "completed",
	}))
	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), &store.StellarExecution{
		UserID: userID.String(), MissionID: mission2.ID, TriggerType: "cron", Status: "running",
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions?mission_id="+mission1.ID, nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 1)
}

func TestListExecutions_FilterByStatus(t *testing.T) {
	app, sqlStore, userID := newExecutionsTestApp(t)

	mission := &store.StellarMission{UserID: userID.String(), Name: "m", Goal: "g"}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))

	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), &store.StellarExecution{
		UserID: userID.String(), MissionID: mission.ID, TriggerType: "manual", Status: "completed",
	}))
	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), &store.StellarExecution{
		UserID: userID.String(), MissionID: mission.ID, TriggerType: "manual", Status: "failed",
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions?status=completed", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 1)
}

func TestListExecutions_Pagination(t *testing.T) {
	app, sqlStore, userID := newExecutionsTestApp(t)

	mission := &store.StellarMission{UserID: userID.String(), Name: "m", Goal: "g"}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))

	for i := 0; i < 5; i++ {
		require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), &store.StellarExecution{
			UserID: userID.String(), MissionID: mission.ID, TriggerType: "manual", Status: "completed",
		}))
	}

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions?limit=2&offset=0", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 2)
	assert.Equal(t, float64(2), body["limit"])
}

func TestListExecutions_Unauthenticated(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "exec-noauth-"+uuid.NewString()+".db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	// No userID middleware — simulates unauthenticated request
	handler := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/executions", handler.ListExecutions)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestGetExecution_Success(t *testing.T) {
	app, sqlStore, userID := newExecutionsTestApp(t)

	mission := &store.StellarMission{UserID: userID.String(), Name: "m", Goal: "g"}
	require.NoError(t, sqlStore.CreateStellarMission(context.Background(), mission))

	exec := &store.StellarExecution{
		UserID: userID.String(), MissionID: mission.ID, TriggerType: "manual", Status: "completed",
	}
	require.NoError(t, sqlStore.CreateStellarExecution(context.Background(), exec))

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions/"+exec.ID, nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, exec.ID, body["id"])
}

func TestGetExecution_NotFound(t *testing.T) {
	app, _, _ := newExecutionsTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions/nonexistent-id", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
}

func TestGetExecution_WhitespaceID(t *testing.T) {
	app, _, _ := newExecutionsTestApp(t)

	// URL-encoded space — TrimSpace makes it empty → 400
	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions/%20%20", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)

	// Fiber may treat whitespace-only param as no match (404) or the handler
	// returns 400 after trimming. Either indicates the request is rejected.
	assert.True(t, resp.StatusCode == fiber.StatusBadRequest || resp.StatusCode == fiber.StatusNotFound,
		"expected 400 or 404, got %d", resp.StatusCode)
}

func TestGetExecution_Unauthenticated(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "exec-noauth2-"+uuid.NewString()+".db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	handler := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/executions/:id", handler.GetExecution)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/executions/some-id", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}
