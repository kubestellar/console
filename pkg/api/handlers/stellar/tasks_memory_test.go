package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

// ---------------------------------------------------------------------------
// Additional mock overrides for memory endpoints not covered elsewhere
// ---------------------------------------------------------------------------

func (m *mockedStellarStore) ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error) {
	if !m.hasExpectation("ListStellarMemoryEntries") {
		return m.SQLiteStore.ListStellarMemoryEntries(ctx, userID, cluster, category, limit, offset)
	}
	args := m.Called(userID, cluster, category, limit, offset)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarMemoryEntry), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error {
	if !m.hasExpectation("DeleteStellarMemoryEntry") {
		return m.SQLiteStore.DeleteStellarMemoryEntry(ctx, userID, entryID)
	}
	args := m.Called(userID, entryID)
	return args.Error(0)
}

// newTasksMemoryTestApp creates a Fiber test app with task and memory routes
// registered. It returns the app, mock store, and the user ID string.
func newTasksMemoryTestApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)

	// Task routes
	app.Get("/api/stellar/tasks", h.ListTasks)
	app.Post("/api/stellar/tasks", h.CreateTask)
	app.Patch("/api/stellar/tasks/:id/status", h.UpdateTaskStatus)

	// Memory routes
	app.Get("/api/stellar/memory", h.ListMemory)
	app.Post("/api/stellar/memory/search", h.SearchMemory)
	app.Delete("/api/stellar/memory/:id", h.DeleteMemory)

	return app, mockStore, userID.String()
}

// ---------------------------------------------------------------------------
// Task handler tests
// ---------------------------------------------------------------------------

func TestListTasks_ReturnsOpenTasks(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	expected := []store.StellarTask{
		{ID: "t1", UserID: userID, Title: "Fix pod crash", Status: "open", Priority: 3},
		{ID: "t2", UserID: userID, Title: "Check logs", Status: "in_progress", Priority: 7},
	}
	mockStore.On("GetOpenTasks", userID).Return(expected, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)
	req.Host = "localhost"

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
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("GetOpenTasks", userID).Return(nil, assert.AnError).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/tasks", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCreateTask_EmptyTitleReturns400(t *testing.T) {
	app, mockStore, _ := newTasksMemoryTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks",
		bytes.NewReader([]byte(`{"title":"   "}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "title is required", payload["error"])
	mockStore.AssertNotCalled(t, "CreateTask", mock.Anything)
}

func TestCreateTask_PriorityClampedToDefault(t *testing.T) {
	tests := []struct {
		name     string
		priority int
		wantPri  int
	}{
		{"below minimum", 0, 5},
		{"above maximum", 11, 5},
		{"negative", -1, 5},
		{"at minimum", 1, 1},
		{"at maximum", 10, 10},
		{"mid-range", 7, 7},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, mockStore, userID := newTasksMemoryTestApp(t)

			mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
				return task.UserID == userID && task.Priority == tt.wantPri
			})).Return("task-id", nil).Once()

			body, _ := json.Marshal(map[string]any{
				"title":    "Test task",
				"priority": tt.priority,
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
			assert.Equal(t, float64(tt.wantPri), created["priority"])
			mockStore.AssertExpectations(t)
		})
	}
}

func TestCreateTask_CustomSourceAndDueAt(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	dueAt := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID &&
			task.Source == "stellar-agent" &&
			task.DueAt != nil
	})).Return("task-due", nil).Once()

	body, _ := json.Marshal(map[string]any{
		"title":  "Scheduled task",
		"source": "stellar-agent",
		"dueAt":  dueAt,
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
	assert.Equal(t, "stellar-agent", created["source"])
	mockStore.AssertExpectations(t)
}

func TestCreateTask_InvalidJSONBody(t *testing.T) {
	app, _, _ := newTasksMemoryTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks",
		bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateTask_StoreErrorReturns500(t *testing.T) {
	app, mockStore, _ := newTasksMemoryTestApp(t)

	mockStore.On("CreateTask", mock.Anything).Return("", assert.AnError).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks",
		bytes.NewReader([]byte(`{"title":"Fail task"}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCreateTask_FullPayload(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	dueAt := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	contextJSON := `{"cluster":"prod","ns":"default"}`

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID &&
			task.SessionID == "sess-1" &&
			task.Cluster == "prod-a" &&
			task.Title == "Full task" &&
			task.Description == "Detailed description" &&
			task.Priority == 2 &&
			task.Source == "observer" &&
			task.ParentID == "parent-1" &&
			task.DueAt != nil &&
			task.ContextJSON == contextJSON &&
			task.Status == "open"
	})).Return("task-full", nil).Once()

	body, _ := json.Marshal(map[string]any{
		"sessionId":   "sess-1",
		"cluster":     "prod-a",
		"title":       "  Full task  ",
		"description": "  Detailed description  ",
		"priority":    2,
		"source":      "  observer  ",
		"parentId":    "  parent-1  ",
		"dueAt":       dueAt,
		"contextJson": contextJSON,
	})
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader(body))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_AllValidStatuses(t *testing.T) {
	validStatuses := []string{"open", "in_progress", "blocked", "done", "dismissed"}

	for _, status := range validStatuses {
		t.Run(status, func(t *testing.T) {
			app, mockStore, userID := newTasksMemoryTestApp(t)

			mockStore.On("UpdateTaskStatus", "task-x", status, userID).Return(nil).Once()
			mockStore.On("GetOpenTasks", userID).Return([]store.StellarTask{}, nil).Once()

			body, _ := json.Marshal(map[string]string{"status": status})
			req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-x/status", bytes.NewReader(body))
			require.NoError(t, err)
			req.Host = "localhost"
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusOK, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, status, payload["status"])
			assert.NotNil(t, payload["items"])
			mockStore.AssertExpectations(t)
		})
	}
}

func TestUpdateTaskStatus_InvalidStatusReturns400(t *testing.T) {
	invalidStatuses := []string{"completed", "cancelled", "pending", "unknown", ""}

	for _, status := range invalidStatuses {
		t.Run("status_"+status, func(t *testing.T) {
			app, mockStore, _ := newTasksMemoryTestApp(t)

			body, _ := json.Marshal(map[string]string{"status": status})
			req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-x/status", bytes.NewReader(body))
			require.NoError(t, err)
			req.Host = "localhost"
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "invalid status", payload["error"])
			mockStore.AssertNotCalled(t, "UpdateTaskStatus", mock.Anything, mock.Anything, mock.Anything)
		})
	}
}

func TestUpdateTaskStatus_CaseInsensitive(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-upper", "in_progress", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return([]store.StellarTask{}, nil).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-upper/status",
		bytes.NewReader([]byte(`{"status":"IN_PROGRESS"}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestUpdateTaskStatus_InvalidJSONBody(t *testing.T) {
	app, _, _ := newTasksMemoryTestApp(t)

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-x/status",
		bytes.NewReader([]byte(`{bad}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateTaskStatus_StoreErrorReturns500(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("UpdateTaskStatus", "task-err", "done", userID).Return(assert.AnError).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-err/status",
		bytes.NewReader([]byte(`{"status":"done"}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

// ---------------------------------------------------------------------------
// Memory handler tests
// ---------------------------------------------------------------------------

func TestListMemory_DefaultParams(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	expected := []store.StellarMemoryEntry{
		{ID: "m1", UserID: userID, Category: "incident", Summary: "pod crash"},
	}
	mockStore.On("ListStellarMemoryEntries", userID, "", "", stellarDefaultListLimit, 0).Return(expected, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/memory", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 1)
	mockStore.AssertExpectations(t)
}

func TestListMemory_WithFilters(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("ListStellarMemoryEntries", userID, "prod-a", "incident", 10, 5).Return([]store.StellarMemoryEntry{}, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/memory?cluster=prod-a&category=incident&limit=10&offset=5", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(10), payload["limit"])
	mockStore.AssertExpectations(t)
}

func TestListMemory_StoreError(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("ListStellarMemoryEntries", userID, "", "", mock.AnythingOfType("int"), 0).Return(nil, assert.AnError).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/memory", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSearchMemory_EmptyQueryReturns400(t *testing.T) {
	app, mockStore, _ := newTasksMemoryTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search",
		bytes.NewReader([]byte(`{"query":"   "}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "query is required", payload["error"])
	mockStore.AssertNotCalled(t, "SearchStellarMemoryEntries", mock.Anything, mock.Anything, mock.Anything)
}

func TestSearchMemory_CustomLimit(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("SearchStellarMemoryEntries", userID, "scale", 5).Return([]store.StellarMemoryEntry{}, nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search",
		bytes.NewReader([]byte(`{"query":"scale","limit":5}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(5), payload["limit"])
	mockStore.AssertExpectations(t)
}

func TestSearchMemory_NegativeLimitDefaultsTo20(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("SearchStellarMemoryEntries", userID, "logs", 20).Return([]store.StellarMemoryEntry{}, nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search",
		bytes.NewReader([]byte(`{"query":"logs","limit":-1}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(20), payload["limit"])
	mockStore.AssertExpectations(t)
}

func TestSearchMemory_InvalidJSONBody(t *testing.T) {
	app, _, _ := newTasksMemoryTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search",
		bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSearchMemory_StoreError(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("SearchStellarMemoryEntries", userID, "crash", 20).Return(nil, assert.AnError).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search",
		bytes.NewReader([]byte(`{"query":"crash"}`)))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestDeleteMemory_Success(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("DeleteStellarMemoryEntry", userID, "mem-42").Return(nil).Once()

	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/memory/mem-42", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestDeleteMemory_StoreError(t *testing.T) {
	app, mockStore, userID := newTasksMemoryTestApp(t)

	mockStore.On("DeleteStellarMemoryEntry", userID, "mem-bad").Return(assert.AnError).Once()

	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/memory/mem-bad", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}
