package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const (
	stellarTaskDefaultPriority    = 5
	stellarTaskDefaultSource      = "user"
	stellarTaskDefaultSessionID   = "default"
	stellarTaskExpectedListCount  = 2
	stellarTaskOutOfRangePriority = 99
)

type stellarTaskListResponse struct {
	Items []store.StellarTask `json:"items"`
}

type stellarTaskStatusResponse struct {
	ID     string              `json:"id"`
	Status string              `json:"status"`
	Items  []store.StellarTask `json:"items"`
}

type stellarTaskErrorResponse struct {
	Error string `json:"error"`
}

func createStellarTaskRequest(t *testing.T, app *fiber.App, body any) store.StellarTask {
	t.Helper()

	payload, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created store.StellarTask
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	return created
}

func listStellarTasksRequest(t *testing.T, app *fiber.App) stellarTaskListResponse {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload stellarTaskListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	return payload
}

func TestStellarListTasks_ReturnsEmptyListInitially(t *testing.T) {
	app, _ := newStellarTestApp(t)

	payload := listStellarTasksRequest(t, app)
	require.NotNil(t, payload.Items)
	assert.Empty(t, payload.Items)
}

func TestStellarCreateTask_PersistsAndNormalizesPayload(t *testing.T) {
	app, _ := newStellarTestApp(t)

	dueAt := time.Now().UTC().Add(24 * time.Hour).Truncate(time.Second)
	created := createStellarTaskRequest(t, app, map[string]any{
		"sessionId":   "  ",
		"cluster":     " prod-a ",
		"title":       "  Investigate OOM kills  ",
		"description": "  Check memory limits  ",
		"priority":    stellarTaskOutOfRangePriority,
		"source":      "  ",
		"parentId":    " parent-1 ",
		"dueAt":       dueAt.Format(time.RFC3339),
		"contextJson": "  ",
	})

	assert.NotEmpty(t, created.ID)
	assert.Equal(t, stellarTaskDefaultSessionID, created.SessionID)
	assert.Equal(t, "prod-a", created.Cluster)
	assert.Equal(t, "Investigate OOM kills", created.Title)
	assert.Equal(t, "Check memory limits", created.Description)
	assert.Equal(t, "open", created.Status)
	assert.Equal(t, stellarTaskDefaultPriority, created.Priority)
	assert.Equal(t, stellarTaskDefaultSource, created.Source)
	assert.Equal(t, "parent-1", created.ParentID)
	require.NotNil(t, created.DueAt)
	assert.True(t, created.DueAt.Equal(dueAt))
	assert.Equal(t, "{}", created.ContextJSON)
}

func TestStellarCreateTask_RejectsInvalidPayloads(t *testing.T) {
	app, _ := newStellarTestApp(t)

	testCases := []struct {
		name          string
		body          []byte
		expectedError string
	}{
		{
			name:          "invalid json",
			body:          []byte(`not json`),
			expectedError: "invalid JSON body",
		},
		{
			name:          "missing title",
			body:          []byte(`{"description":"missing title"}`),
			expectedError: "title is required",
		},
		{
			name:          "whitespace title",
			body:          []byte(`{"title":"   "}`),
			expectedError: "title is required",
		},
		{
			name:          "invalid dueAt",
			body:          []byte(`{"title":"Investigate","dueAt":"not-rfc3339"}`),
			expectedError: "dueAt must be RFC3339",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(tc.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarTestFiberTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var payload stellarTaskErrorResponse
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, tc.expectedError, payload.Error)
		})
	}
}

func TestStellarListTasks_ReturnsOnlyOpenTasks(t *testing.T) {
	app, _ := newStellarTestApp(t)

	firstTask := createStellarTaskRequest(t, app, map[string]any{"title": "Task A", "priority": 2})
	secondTask := createStellarTaskRequest(t, app, map[string]any{"title": "Task B", "priority": 1})
	doneTask := createStellarTaskRequest(t, app, map[string]any{"title": "Task Done", "priority": 3})

	updateReq, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/"+doneTask.ID+"/status", bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	updateReq.Header.Set("Content-Type", "application/json")

	updateResp, err := app.Test(updateReq, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer updateResp.Body.Close()
	require.Equal(t, http.StatusOK, updateResp.StatusCode)

	payload := listStellarTasksRequest(t, app)
	require.Len(t, payload.Items, stellarTaskExpectedListCount)
	assert.Equal(t, secondTask.ID, payload.Items[0].ID)
	assert.Equal(t, firstTask.ID, payload.Items[1].ID)
}

func TestStellarUpdateTaskStatus_TransitionsAndFiltersItems(t *testing.T) {
	app, _ := newStellarTestApp(t)

	testCases := []struct {
		name              string
		requestStatus     string
		expectedStatus    string
		expectTaskPresent bool
	}{
		{name: "in progress", requestStatus: "IN_PROGRESS", expectedStatus: "in_progress", expectTaskPresent: true},
		{name: "blocked", requestStatus: "blocked", expectedStatus: "blocked", expectTaskPresent: true},
		{name: "done", requestStatus: "done", expectedStatus: "done", expectTaskPresent: false},
		{name: "dismissed", requestStatus: "dismissed", expectedStatus: "dismissed", expectTaskPresent: false},
		{name: "reopened", requestStatus: "open", expectedStatus: "open", expectTaskPresent: true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			task := createStellarTaskRequest(t, app, map[string]any{"title": tc.name})

			req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/"+task.ID+"/status", bytes.NewReader([]byte(`{"status":"`+tc.requestStatus+`"}`)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarTestFiberTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusOK, resp.StatusCode)

			var payload stellarTaskStatusResponse
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, task.ID, payload.ID)
			assert.Equal(t, tc.expectedStatus, payload.Status)
			assert.Equal(t, tc.expectTaskPresent, taskIDPresent(payload.Items, task.ID))
		})
	}
}

func TestStellarUpdateTaskStatus_RejectsInvalidPayloads(t *testing.T) {
	app, _ := newStellarTestApp(t)
	task := createStellarTaskRequest(t, app, map[string]any{"title": "Task to validate"})

	testCases := []struct {
		name          string
		body          []byte
		expectedError string
	}{
		{
			name:          "invalid json",
			body:          []byte(`not json`),
			expectedError: "invalid JSON body",
		},
		{
			name:          "invalid status",
			body:          []byte(`{"status":"later"}`),
			expectedError: "invalid status",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/"+task.ID+"/status", bytes.NewReader(tc.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarTestFiberTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var payload stellarTaskErrorResponse
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, tc.expectedError, payload.Error)
		})
	}
}

func taskIDPresent(items []store.StellarTask, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}
