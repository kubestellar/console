package stellar

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListTasks_ReturnsEmptyListInitially(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items)
}

func TestCreateTask_Success(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"title":       "Investigate OOM kills",
		"description": "Check pod memory limits in prod-a",
		"cluster":     "prod-a",
		"priority":    3,
		"source":      "stellar",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.NotEmpty(t, created["id"])
	assert.Equal(t, "Investigate OOM kills", created["title"])
	assert.Equal(t, "open", created["status"])
	assert.Equal(t, "stellar", created["source"])
	assert.Equal(t, float64(3), created["priority"])
}

func TestCreateTask_MissingTitle(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"description": "no title provided",
		"cluster":     "prod-a",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "title is required", errResp["error"])
}

func TestCreateTask_EmptyTitle(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"title": "   ",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateTask_InvalidBody(t *testing.T) {
	app, _ := newStellarTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateTask_PriorityClampedToDefault(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"title":    "Task with out-of-range priority",
		"priority": 99,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, float64(5), created["priority"], "out-of-range priority should be clamped to 5")
}

func TestCreateTask_DefaultSourceIsUser(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"title": "Task without source",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "user", created["source"])
}

func TestCreateTask_WithDueAt(t *testing.T) {
	app, _ := newStellarTestApp(t)

	dueAt := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	body := map[string]any{
		"title": "Task with deadline",
		"dueAt": dueAt,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.NotNil(t, created["dueAt"])
}

func TestCreateTask_InvalidDueAt(t *testing.T) {
	app, _ := newStellarTestApp(t)

	body := map[string]any{
		"title": "Task with bad date",
		"dueAt": "not-a-date",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&errResp))
	assert.Equal(t, "dueAt must be RFC3339", errResp["error"])
}

func TestUpdateTaskStatus_ValidTransitions(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// Create a task first
	createBody := map[string]any{"title": "Task to update"}
	raw, _ := json.Marshal(createBody)
	createReq, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	createReq.Header.Set("Content-Type", "application/json")
	createResp, err := app.Test(createReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(createResp.Body).Decode(&created))
	taskID := created["id"].(string)

	validStatuses := []string{"in_progress", "blocked", "done", "dismissed", "open"}
	for _, status := range validStatuses {
		t.Run(status, func(t *testing.T) {
			updateBody := map[string]any{"status": status}
			updateRaw, _ := json.Marshal(updateBody)
			updateReq, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/"+taskID+"/status", bytes.NewReader(updateRaw))
			require.NoError(t, err)
			updateReq.Header.Set("Content-Type", "application/json")
			updateResp, err := app.Test(updateReq, stellarTestFiberTimeoutMs)
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, updateResp.StatusCode)

			var result map[string]any
			require.NoError(t, json.NewDecoder(updateResp.Body).Decode(&result))
			assert.Equal(t, status, result["status"])
			assert.Equal(t, taskID, result["id"])
		})
	}
}

func TestUpdateTaskStatus_InvalidStatus(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// Create a task first
	createBody := map[string]any{"title": "Task for invalid status test"}
	raw, _ := json.Marshal(createBody)
	createReq, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
	require.NoError(t, err)
	createReq.Header.Set("Content-Type", "application/json")
	createResp, err := app.Test(createReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, createResp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(createResp.Body).Decode(&created))
	taskID := created["id"].(string)

	updateBody := map[string]any{"status": "invalid_status"}
	updateRaw, _ := json.Marshal(updateBody)
	updateReq, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/"+taskID+"/status", bytes.NewReader(updateRaw))
	require.NoError(t, err)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp, err := app.Test(updateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, updateResp.StatusCode)

	var errResp map[string]any
	require.NoError(t, json.NewDecoder(updateResp.Body).Decode(&errResp))
	assert.Equal(t, "invalid status", errResp["error"])
}

func TestUpdateTaskStatus_NonExistentID(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// The store's UpdateTaskStatus does not error for non-existent IDs —
	// it updates zero rows silently. The handler returns OK with the status.
	updateBody := map[string]any{"status": "done"}
	updateRaw, _ := json.Marshal(updateBody)
	updateReq, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/nonexistent-task-id/status", bytes.NewReader(updateRaw))
	require.NoError(t, err)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp, err := app.Test(updateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, updateResp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(updateResp.Body).Decode(&result))
	assert.Equal(t, "nonexistent-task-id", result["id"])
	assert.Equal(t, "done", result["status"])
}

func TestUpdateTaskStatus_InvalidBody(t *testing.T) {
	app, _ := newStellarTestApp(t)

	updateReq, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/some-id/status", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp, err := app.Test(updateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, updateResp.StatusCode)
}

func TestListTasks_AfterCreatingTasks(t *testing.T) {
	app, _ := newStellarTestApp(t)

	// Create two tasks
	for _, title := range []string{"Task A", "Task B"} {
		body := map[string]any{"title": title}
		raw, _ := json.Marshal(body)
		req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(raw))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarTestFiberTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, resp.StatusCode)
	}

	// List tasks
	listReq, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)
	listResp, err := app.Test(listReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, listResp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(listResp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 2)
}
