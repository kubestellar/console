package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const stellarMockedHandlerTestTimeoutMs = 5000

type mockedStellarStore struct {
	*store.SQLiteStore
	mock.Mock
}

func newMockedStellarStore(t *testing.T) *mockedStellarStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-mocked-handlers.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = sqlStore.Close()
	})
	return &mockedStellarStore{SQLiteStore: sqlStore}
}

func (m *mockedStellarStore) hasExpectation(method string) bool {
	for _, call := range m.ExpectedCalls {
		if call.Method == method {
			return true
		}
	}
	return false
}

func (m *mockedStellarStore) CreateTask(ctx context.Context, task *store.StellarTask) (string, error) {
	if !m.hasExpectation("CreateTask") {
		return m.SQLiteStore.CreateTask(ctx, task)
	}
	args := m.Called(task)
	return args.String(0), args.Error(1)
}

func (m *mockedStellarStore) GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error) {
	if !m.hasExpectation("GetOpenTasks") {
		return m.SQLiteStore.GetOpenTasks(ctx, userID)
	}
	args := m.Called(userID)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarTask), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) UpdateTaskStatus(ctx context.Context, id, status, userID string) error {
	if !m.hasExpectation("UpdateTaskStatus") {
		return m.SQLiteStore.UpdateTaskStatus(ctx, id, status, userID)
	}
	args := m.Called(id, status, userID)
	return args.Error(0)
}

func (m *mockedStellarStore) SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error) {
	if !m.hasExpectation("SearchStellarMemoryEntries") {
		return m.SQLiteStore.SearchStellarMemoryEntries(ctx, userID, query, limit)
	}
	args := m.Called(userID, query, limit)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarMemoryEntry), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) UpsertProviderConfig(ctx context.Context, cfg *store.StellarProviderConfig) error {
	if !m.hasExpectation("UpsertProviderConfig") {
		return m.SQLiteStore.UpsertProviderConfig(ctx, cfg)
	}
	args := m.Called(cfg)
	return args.Error(0)
}

func newMockedStellarHandlerApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewStellarHandler(mockStore, nil)
	app.Post("/api/stellar/tasks", h.CreateTask)
	app.Patch("/api/stellar/tasks/:id/status", h.UpdateTaskStatus)
	app.Post("/api/stellar/memory/search", h.SearchMemory)
	app.Post("/api/stellar/providers", h.CreateProvider)

	return app, mockStore, userID.String()
}

func TestStellarCreateTask_DefaultsWithMockedStore(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)

	mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
		return task.UserID == userID &&
			task.Title == "Investigate failed rollout" &&
			task.Priority == 5 &&
			task.Source == "user" &&
			task.ContextJSON == "{}" &&
			task.Status == "open"
	})).Return("task-123", nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Investigate failed rollout"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "task-123", created["id"])
	assert.Equal(t, "Investigate failed rollout", created["title"])
	assert.Equal(t, float64(5), created["priority"])
	assert.Equal(t, "user", created["source"])
	mockStore.AssertExpectations(t)
}

func TestStellarCreateTask_InvalidDueAtReturnsBadRequest(t *testing.T) {
	app, mockStore, _ := newMockedStellarHandlerApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/tasks", bytes.NewReader([]byte(`{"title":"Investigate failed rollout","dueAt":"not-rfc3339"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	mockStore.AssertNotCalled(t, "CreateTask", mock.Anything)
}

func TestStellarUpdateTaskStatus_ReturnsStatusWhenReloadFails(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)

	mockStore.On("UpdateTaskStatus", "task-7", "done", userID).Return(nil).Once()
	mockStore.On("GetOpenTasks", userID).Return(nil, errors.New("reload failed")).Once()

	req, err := http.NewRequest(http.MethodPatch, "/api/stellar/tasks/task-7/status", bytes.NewReader([]byte(`{"status":"DONE"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "task-7", payload["id"])
	assert.Equal(t, "done", payload["status"])
	_, hasItems := payload["items"]
	assert.False(t, hasItems)
	mockStore.AssertExpectations(t)
}

func TestStellarSearchMemory_DefaultLimitWithMockedStore(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)

	expected := []store.StellarMemoryEntry{{ID: "mem-1", UserID: userID, Category: "incident"}}
	mockStore.On("SearchStellarMemoryEntries", userID, "oomkilled", 20).Return(expected, nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader([]byte(`{"query":"oomkilled"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, float64(20), payload["limit"])
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	require.Len(t, items, 1)
	mockStore.AssertExpectations(t)
}

func TestStellarCreateProvider_UsesMockedUpsert(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)

	mockStore.On("UpsertProviderConfig", mock.MatchedBy(func(cfg *store.StellarProviderConfig) bool {
		return cfg.UserID == userID &&
			cfg.Provider == "ollama" &&
			cfg.DisplayName == "Local Ollama" &&
			cfg.BaseURL == "http://127.0.0.1:11434" &&
			cfg.Model == "llama3" &&
			cfg.IsActive
	})).Return(nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers", bytes.NewReader([]byte(`{"provider":"ollama","displayName":"Local Ollama","baseUrl":"http://127.0.0.1:11434","model":"llama3"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "ollama", created["provider"])
	assert.Equal(t, "http://127.0.0.1:11434", created["baseUrl"])
	mockStore.AssertExpectations(t)
}
