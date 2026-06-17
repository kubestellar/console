package stellar

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

func newTasksTestApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/tasks", h.ListTasks)
	app.Post("/api/stellar/tasks", h.CreateTask)
	app.Patch("/api/stellar/tasks/:id/status", h.UpdateTaskStatus)

	return app, mockStore, userID.String()
}

func TestListTasks_Success(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	expected := []store.StellarTask{
		{ID: "task-1", UserID: userID, Title: "Fix pod crash", Status: "open"},
		{ID: "task-2", UserID: userID, Title: "Investigate OOM", Status: "in_progress"},
	}
	mockStore.On("GetOpenTasks", userID).Return(expected, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 2)
	mockStore.AssertExpectations(t)
}

func TestListTasks_StoreError(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("GetOpenTasks", userID).Return(nil, errors.New("db error")).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "failed to load tasks", payload["error"])
	mockStore.AssertExpectations(t)
}

func TestListTasks_EmptyList(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("GetOpenTasks", userID).Return([]store.StellarTask{}, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items)
	mockStore.AssertExpectations(t)
}

func TestCreateTask_AllFields(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID &&
			task.Title == "Deploy canary" &&
			task.Description == "Roll out canary to production" &&
			task.Cluster == "prod-east" &&
			task.Priority == 8 &&
			task.Source == "automation" &&
			task.ParentID == "parent-1" &&
			task.ContextJSON == `{"namespace":"default"}` &&
			task.Status == "open" &&
			task.DueAt != nil
	})).Return("task-full", nil).Once()

	body := `{
		"title": "Deploy canary",
		"description": "Roll out canary to production",
		"cluster": "prod-east",
		"priority": 8,
		"source": "automation",
		"parentId": "parent-1",
		"dueAt": "2026-12-01T10:00:00Z",
		"contextJson": "{\"namespace\":\"default\"}"
	}`
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "task-full", created["id"])
	assert.Equal(t, "Deploy canary", created["title"])
	assert.Equal(t, float64(8), created["priority"])
	assert.Equal(t, "automation", created["source"])
	mockStore.AssertExpectations(t)
}

func TestCreateTask_MissingTitle(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"description":"no title"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "title is required", payload["error"])
}

func TestCreateTask_WhitespaceOnlyTitle(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"   "}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "title is required", payload["error"])
}

func TestCreateTask_InvalidBody(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid JSON body", payload["error"])
}

func TestCreateTask_InvalidDueAt(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Test","dueAt":"not-a-date"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "dueAt must be RFC3339", payload["error"])
}

func TestCreateTask_PriorityClampedToDefault(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID && task.Priority == 5
	})).Return("task-clamped", nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Test","priority":99}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCreateTask_ZeroPriorityClampedToDefault(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID && task.Priority == 5
	})).Return("task-zero", nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Test","priority":0}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCreateTask_StoreError(t *testing.T) {
	app, mockStore, _ := newTasksTestApp(t)

	mockStore.On("CreateTask", mock.Anything).Return("", errors.New("db failure")).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Test task"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "failed to create task", payload["error"])
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_ValidTransitions(t *testing.T) {
	validStatuses := []string{"open", "in_progress", "blocked", "done", "dismissed"}

	for _, status := range validStatuses {
		t.Run("status_"+status, func(t *testing.T) {
			app, mockStore, userID := newTasksTestApp(t)

			mockStore.On("UpdateTaskStatus", "task-42", status, userID).Return(nil).Once()
			mockStore.On("GetOpenTasks", userID).Return([]store.StellarTask{}, nil).Once()

			body := `{"status":"` + status + `"}`
			req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-42/status", bytes.NewReader([]byte(body)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusOK, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "task-42", payload["id"])
			assert.Equal(t, status, payload["status"])
			mockStore.AssertExpectations(t)
		})
	}
}

func TestUpdateTaskStatus_CaseInsensitive(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-1", "done", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return([]store.StellarTask{}, nil).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`{"status":"DONE"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_InvalidStatus(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`{"status":"invalid"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid status", payload["error"])
}

func TestUpdateTaskStatus_InvalidBody(t *testing.T) {
	app, _, _ := newTasksTestApp(t)

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid JSON body", payload["error"])
}

func TestUpdateTaskStatus_StoreUpdateError(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-1", "done", userID).Return(errors.New("store error")).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "failed to update task status", payload["error"])
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_IncludesItemsOnReloadSuccess(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	remaining := []store.StellarTask{
		{ID: "task-2", UserID: userID, Title: "Still open", Status: "open"},
	}
	mockStore.On("UpdateTaskStatus", "task-1", "done", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return(remaining, nil).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "task-1", payload["id"])
	assert.Equal(t, "done", payload["status"])
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 1)
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_NoItemsOnReloadFailure(t *testing.T) {
	app, mockStore, userID := newTasksTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-1", "done", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return(nil, errors.New("reload failed")).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-1/status", bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "task-1", payload["id"])
	assert.Equal(t, "done", payload["status"])
	_, hasItems := payload["items"]
	assert.False(t, hasItems)
	mockStore.AssertExpectations(t)
}
