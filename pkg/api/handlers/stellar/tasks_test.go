package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const (
	stellarTasksRoute       = "/api/stellar/tasks"
	stellarTaskStatusRoute  = "/api/stellar/tasks/:id/status"
	stellarTaskDueAtRFC3339 = "2026-06-17T20:00:00Z"
)

type taskCreateErrorStore struct {
	Store
}

func (s taskCreateErrorStore) CreateTask(_ context.Context, _ *store.StellarTask) (string, error) {
	return "", errors.New("create failed")
}

type taskListErrorStore struct {
	Store
}

func (s taskListErrorStore) GetOpenTasks(_ context.Context, _ string) ([]store.StellarTask, error) {
	return nil, errors.New("list failed")
}

type taskUpdateErrorStore struct {
	Store
}

func (s taskUpdateErrorStore) UpdateTaskStatus(_ context.Context, _, _, _ string) error {
	return errors.New("update failed")
}

func newTasksHandlerTestApp(t *testing.T, handlerStore Store, authenticated bool) (*fiber.App, string) {
	t.Helper()

	userID := uuid.New()
	app := fiber.New()
	if authenticated {
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
	}

	handler := NewHandler(handlerStore, nil)
	app.Get(stellarTasksRoute, handler.ListTasks)
	app.Post(stellarTasksRoute, handler.CreateTask)
	app.Patch(stellarTaskStatusRoute, handler.UpdateTaskStatus)

	return app, userID.String()
}

func sendStellarJSONRequest(t *testing.T, app *fiber.App, method, path string, body string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(method, path, bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = resp.Body.Close()
	})

	return resp
}

func decodeJSONBody[T any](t *testing.T, resp *http.Response) T {
	t.Helper()

	var payload T
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	return payload
}

func TestTaskHandlersRequireAuthentication(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, tasksStore, false)

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "list", method: http.MethodGet, path: stellarTasksRoute},
		{name: "create", method: http.MethodPost, path: stellarTasksRoute, body: `{"title":"Investigate rollout"}`},
		{name: "update", method: http.MethodPatch, path: "/api/stellar/tasks/task-1/status", body: `{"status":"done"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := sendStellarJSONRequest(t, app, tt.method, tt.path, tt.body)
			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		})
	}
}

func TestListTasksReturnsOpenTasksForCurrentUser(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, userID := newTasksHandlerTestApp(t, tasksStore, true)
	testCtx := context.Background()

	_, err := tasksStore.CreateTask(testCtx, &store.StellarTask{
		ID:       "task-open",
		UserID:   userID,
		Title:    "Open task",
		Status:   "open",
		Priority: 2,
	})
	require.NoError(t, err)

	_, err = tasksStore.CreateTask(testCtx, &store.StellarTask{
		ID:       "task-blocked",
		UserID:   userID,
		Title:    "Blocked task",
		Status:   "blocked",
		Priority: 1,
	})
	require.NoError(t, err)

	_, err = tasksStore.CreateTask(testCtx, &store.StellarTask{
		ID:       "task-done",
		UserID:   userID,
		Title:    "Done task",
		Status:   "done",
		Priority: 3,
	})
	require.NoError(t, err)

	_, err = tasksStore.CreateTask(testCtx, &store.StellarTask{
		ID:       "other-user-task",
		UserID:   "other-user",
		Title:    "Other user task",
		Status:   "open",
		Priority: 1,
	})
	require.NoError(t, err)

	resp := sendStellarJSONRequest(t, app, http.MethodGet, stellarTasksRoute, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Items []store.StellarTask `json:"items"`
	}
	payload = decodeJSONBody[struct {
		Items []store.StellarTask `json:"items"`
	}](t, resp)

	require.Len(t, payload.Items, 2)
	assert.Equal(t, "task-blocked", payload.Items[0].ID)
	assert.Equal(t, "task-open", payload.Items[1].ID)
}

func TestListTasksReturnsInternalServerErrorWhenStoreFails(t *testing.T) {
	baseStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, taskListErrorStore{Store: baseStore}, true)

	resp := sendStellarJSONRequest(t, app, http.MethodGet, stellarTasksRoute, "")
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	payload := decodeJSONBody[map[string]string](t, resp)
	assert.Equal(t, "failed to load tasks", payload["error"])
}

func TestCreateTaskValidation(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, tasksStore, true)

	tests := []struct {
		name         string
		body         string
		wantStatus   int
		wantErrorMsg string
	}{
		{name: "invalid json", body: `{"title":`, wantStatus: http.StatusBadRequest, wantErrorMsg: "invalid JSON body"},
		{name: "missing title", body: `{"description":"x"}`, wantStatus: http.StatusBadRequest, wantErrorMsg: "title is required"},
		{name: "blank title", body: `{"title":"   "}`, wantStatus: http.StatusBadRequest, wantErrorMsg: "title is required"},
		{name: "invalid dueAt", body: `{"title":"Investigate","dueAt":"not-rfc3339"}`, wantStatus: http.StatusBadRequest, wantErrorMsg: "dueAt must be RFC3339"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarTasksRoute, tt.body)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			payload := decodeJSONBody[map[string]string](t, resp)
			assert.Equal(t, tt.wantErrorMsg, payload["error"])
		})
	}
}

func TestCreateTaskPersistsNormalizedValues(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, userID := newTasksHandlerTestApp(t, tasksStore, true)
	testCtx := context.Background()

	resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarTasksRoute, `{
		"sessionId":"  sess-1  ",
		"cluster":"  cluster-a  ",
		"title":"  Investigate rollout  ",
		"description":"  Review logs  ",
		"priority":99,
		"parentId":"  task-parent  ",
		"dueAt":"`+stellarTaskDueAtRFC3339+`"
	}`)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	created := decodeJSONBody[store.StellarTask](t, resp)
	assert.Equal(t, userID, created.UserID)
	assert.Equal(t, "sess-1", created.SessionID)
	assert.Equal(t, "cluster-a", created.Cluster)
	assert.Equal(t, "Investigate rollout", created.Title)
	assert.Equal(t, "Review logs", created.Description)
	assert.Equal(t, "open", created.Status)
	assert.Equal(t, 5, created.Priority)
	assert.Equal(t, "user", created.Source)
	assert.Equal(t, "task-parent", created.ParentID)
	require.NotNil(t, created.DueAt)
	assert.Equal(t, stellarTaskDueAtRFC3339, created.DueAt.UTC().Format(time.RFC3339))
	assert.Equal(t, "{}", created.ContextJSON)

	items, err := tasksStore.GetOpenTasks(testCtx, userID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, created.ID, items[0].ID)
}

func TestCreateTaskReturnsInternalServerErrorWhenStoreFails(t *testing.T) {
	baseStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, taskCreateErrorStore{Store: baseStore}, true)

	resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarTasksRoute, `{"title":"Investigate rollout"}`)
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	payload := decodeJSONBody[map[string]string](t, resp)
	assert.Equal(t, "failed to create task", payload["error"])
}

func TestUpdateTaskStatusValidation(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, tasksStore, true)

	tests := []struct {
		name         string
		path         string
		body         string
		wantStatus   int
		wantErrorMsg string
	}{
		{name: "invalid json", path: "/api/stellar/tasks/task-1/status", body: `{"status":`, wantStatus: http.StatusBadRequest, wantErrorMsg: "invalid JSON body"},
		{name: "invalid status", path: "/api/stellar/tasks/task-1/status", body: `{"status":"paused"}`, wantStatus: http.StatusBadRequest, wantErrorMsg: "invalid status"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := sendStellarJSONRequest(t, app, http.MethodPatch, tt.path, tt.body)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			payload := decodeJSONBody[map[string]string](t, resp)
			assert.Equal(t, tt.wantErrorMsg, payload["error"])
		})
	}
}

func TestUpdateTaskStatusReturnsUpdatedItems(t *testing.T) {
	tasksStore := store.OpenTestDB(t)
	app, userID := newTasksHandlerTestApp(t, tasksStore, true)
	testCtx := context.Background()

	taskID, err := tasksStore.CreateTask(testCtx, &store.StellarTask{
		UserID:   userID,
		Title:    "Investigate rollout",
		Status:   "open",
		Priority: 4,
	})
	require.NoError(t, err)

	resp := sendStellarJSONRequest(t, app, http.MethodPatch, "/api/stellar/tasks/"+taskID+"/status", `{"status":"IN_PROGRESS"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		ID     string              `json:"id"`
		Status string              `json:"status"`
		Items  []store.StellarTask `json:"items"`
	}
	payload = decodeJSONBody[struct {
		ID     string              `json:"id"`
		Status string              `json:"status"`
		Items  []store.StellarTask `json:"items"`
	}](t, resp)

	assert.Equal(t, taskID, payload.ID)
	assert.Equal(t, "in_progress", payload.Status)
	require.Len(t, payload.Items, 1)
	assert.Equal(t, "in_progress", payload.Items[0].Status)
}

func TestUpdateTaskStatusReturnsInternalServerErrorWhenStoreFails(t *testing.T) {
	baseStore := store.OpenTestDB(t)
	app, _ := newTasksHandlerTestApp(t, taskUpdateErrorStore{Store: baseStore}, true)

	resp := sendStellarJSONRequest(t, app, http.MethodPatch, "/api/stellar/tasks/task-1/status", `{"status":"done"}`)
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	payload := decodeJSONBody[map[string]string](t, resp)
	assert.Equal(t, "failed to update task status", payload["error"])
}
