package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// newActionsCRUDTestApp registers all action CRUD endpoints and returns the
// app together with the underlying store. The injected user is an Admin so
// ApproveAction (which calls RequireEditorOrAdmin) is always permitted.
func newActionsCRUDTestApp(t *testing.T) (*fiber.App, *store.SQLiteStore, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-actions-crud-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	userID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "actions-crud-test",
		Role:        models.UserRoleAdmin,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/actions", h.ListActions)
	app.Post("/api/stellar/actions", h.CreateAction)
	app.Get("/api/stellar/actions/:id", h.GetAction)
	app.Post("/api/stellar/actions/:id/approve", h.ApproveAction)
	app.Post("/api/stellar/actions/:id/reject", h.RejectAction)
	app.Delete("/api/stellar/actions/:id", h.DeleteAction)

	return app, sqlStore, userID.String()
}

// postAction is a test helper that creates an action via the API and returns
// the parsed response body. It asserts 201 Created.
func postAction(t *testing.T, app *fiber.App, body map[string]any) map[string]any {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	return result
}

func minimalAction() map[string]any {
	return map[string]any{
		"description": "Scale worker",
		"actionType":  "ScaleDeployment",
		"cluster":     "prod-a",
		"namespace":   "default",
		"parameters":  map[string]any{"replicas": 3},
	}
}

// ─── ListActions ──────────────────────────────────────────────────────────────

func TestListActions_EmptyReturnsItems(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	req, err := http.NewRequest(http.MethodGet, "/api/stellar/actions", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, _ := payload["items"].([]any)
	assert.Empty(t, items)
	_, hasLimit := payload["limit"]
	assert.True(t, hasLimit)
}

func TestListActions_ListsCreatedActions(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	postAction(t, app, minimalAction())
	postAction(t, app, map[string]any{
		"description": "Restart API",
		"actionType":  "RestartDeployment",
		"cluster":     "staging",
	})

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/actions", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, _ := payload["items"].([]any)
	assert.Len(t, items, 2)
}

func TestListActions_FilterByStatus(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	postAction(t, app, minimalAction()) // status=pending_approval

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/actions?status=pending_approval", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, _ := payload["items"].([]any)
	assert.Len(t, items, 1)
}

// ─── CreateAction ─────────────────────────────────────────────────────────────

func TestCreateAction_RequiredFieldsSucceeds(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	action := postAction(t, app, minimalAction())
	assert.NotEmpty(t, action["id"])
	assert.Equal(t, "pending_approval", action["status"])
	assert.Equal(t, "Scale worker", action["description"])
	assert.Equal(t, "ScaleDeployment", action["actionType"])
	assert.Equal(t, "prod-a", action["cluster"])
}

func TestCreateAction_MissingDescription_ReturnsBadRequest(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	body := map[string]any{"actionType": "ScaleDeployment", "cluster": "prod-a"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateAction_MissingCluster_ReturnsBadRequest(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	body := map[string]any{"description": "Do something", "actionType": "ScaleDeployment"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateAction_InvalidJSON_ReturnsBadRequest(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader([]byte("not-json")))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateAction_InvalidScheduledAt_ReturnsBadRequest(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	body := map[string]any{
		"description": "Do something",
		"actionType":  "ScaleDeployment",
		"cluster":     "prod-a",
		"scheduledAt": "not-a-timestamp",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateAction_CreatesActionRequiredNotification(t *testing.T) {
	app, sqlStore, userID := newActionsCRUDTestApp(t)
	postAction(t, app, minimalAction())

	notifs, err := sqlStore.ListStellarNotifications(t.Context(), userID, 50, false)
	require.NoError(t, err)
	found := false
	for _, n := range notifs {
		if n.Type == "ActionRequired" {
			found = true
			break
		}
	}
	assert.True(t, found, "expected ActionRequired notification after CreateAction")
}

// ─── GetAction ────────────────────────────────────────────────────────────────

func TestGetAction_ReturnsCreatedAction(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/actions/"+actionID, nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var action map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&action))
	assert.Equal(t, actionID, action["id"])
	assert.Equal(t, "pending_approval", action["status"])
}

func TestGetAction_UnknownID_Returns404(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	req, err := http.NewRequest(http.MethodGet, "/api/stellar/actions/does-not-exist", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ─── ApproveAction ────────────────────────────────────────────────────────────

func TestApproveAction_NonDestructive_Succeeds(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction()) // ScaleDeployment — not destructive
	actionID := created["id"].(string)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/approve",
		bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, actionID, result["id"])
	// After approval the status transitions away from pending_approval
	status, _ := result["status"].(string)
	assert.NotEqual(t, "pending_approval", status)
}

func TestApproveAction_AlreadyApproved_ReturnsConflict(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	approve := func() *http.Response {
		req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/approve",
			bytes.NewReader([]byte(`{}`)))
		require.NoError(t, err)
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarTestFiberTimeoutMs)
		require.NoError(t, err)
		return resp
	}

	first := approve()
	first.Body.Close()
	require.Equal(t, http.StatusOK, first.StatusCode)

	second := approve()
	defer second.Body.Close()
	assert.Equal(t, http.StatusConflict, second.StatusCode)
}

func TestApproveAction_UnknownID_Returns404(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/nonexistent/approve",
		bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ─── RejectAction ─────────────────────────────────────────────────────────────

func TestRejectAction_PendingAction_Succeeds(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	body := map[string]any{"reason": "too risky at this time"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/reject",
		bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, actionID, result["id"])
	assert.Equal(t, "rejected", result["status"])
}

func TestRejectAction_EmptyReason_Succeeds(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/reject",
		bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRejectAction_CreatesRejectedNotification(t *testing.T) {
	app, sqlStore, userID := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	body := map[string]any{"reason": "out of scope"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/"+actionID+"/reject",
		bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	notifs, err := sqlStore.ListStellarNotifications(t.Context(), userID, 50, false)
	require.NoError(t, err)
	found := false
	for _, n := range notifs {
		if n.Title == "Action rejected" {
			found = true
			break
		}
	}
	assert.True(t, found, "expected 'Action rejected' notification after RejectAction")
}

// ─── DeleteAction ─────────────────────────────────────────────────────────────

func TestDeleteAction_ExistingAction_ReturnsNoContent(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/actions/"+actionID, nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestDeleteAction_ThenGetReturns404(t *testing.T) {
	app, _, _ := newActionsCRUDTestApp(t)
	created := postAction(t, app, minimalAction())
	actionID := created["id"].(string)

	delReq, err := http.NewRequest(http.MethodDelete, "/api/stellar/actions/"+actionID, nil)
	require.NoError(t, err)
	delReq.Host = "localhost"
	delResp, err := app.Test(delReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	delResp.Body.Close()
	require.Equal(t, http.StatusNoContent, delResp.StatusCode)

	getReq, err := http.NewRequest(http.MethodGet, "/api/stellar/actions/"+actionID, nil)
	require.NoError(t, err)
	getReq.Host = "localhost"
	getResp, err := app.Test(getReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer getResp.Body.Close()
	assert.Equal(t, http.StatusNotFound, getResp.StatusCode)
}
