package stellar

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

// TestCreateTask_InvalidDueAtReturns400 covers the RFC3339 parse-failure branch
// in CreateTask, which previously had no test coverage.
func TestCreateTask_InvalidDueAtReturns400(t *testing.T) {
	app, mockStore, _ := newTasksMemoryTestApp(t)

	body, _ := json.Marshal(map[string]any{
		"title": "Bad dueAt",
		"dueAt": "not-a-timestamp",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(body))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "dueAt must be RFC3339", payload["error"])
	mockStore.AssertNotCalled(t, "CreateTask", mock.Anything)
}

// TestUpdateTaskStatus_GetOpenTasksFallback covers the fallback branch where
// UpdateTaskStatus succeeds but the subsequent GetOpenTasks refresh returns an
// error — the handler must still respond 200 with the id and new status but
// without an items array.
func TestUpdateTaskStatus_GetOpenTasksFallback(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-refresh-fail", "done", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return(nil, assert.AnError).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-refresh-fail/status",
		bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "task-refresh-fail", payload["id"])
	assert.Equal(t, "done", payload["status"])
	// Fallback path must not include an items array.
	_, hasItems := payload["items"]
	assert.False(t, hasItems, "fallback response should omit items when GetOpenTasks fails")
	mockStore.AssertExpectations(t)
}

// TestCreateTask_DefaultSourceWhenBlank verifies that CreateTask defaults the
// Source field to "user" when the client submits an empty (or whitespace)
// source, closing a small gap in the CreateTask branch coverage where the
// default-source branch was only implicitly exercised.
func TestCreateTask_DefaultSourceWhenBlank(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID && task.Source == "user" && task.ContextJSON == "{}"
	})).Return("task-default-src", nil).Once()

	body, _ := json.Marshal(map[string]any{
		"title":  "Default source task",
		"source": "   ",
	})
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(body))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "user", created["source"])
	mockStore.AssertExpectations(t)
}
