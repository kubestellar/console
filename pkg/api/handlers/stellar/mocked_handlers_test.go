package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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

func (m *mockedStellarStore) GetUserProviderConfigs(ctx context.Context, userID string) ([]store.StellarProviderConfig, error) {
	if !m.hasExpectation("GetUserProviderConfigs") {
		return m.SQLiteStore.GetUserProviderConfigs(ctx, userID)
	}
	args := m.Called(userID)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarProviderConfig), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) DeleteProviderConfig(ctx context.Context, providerID, userID string) error {
	if !m.hasExpectation("DeleteProviderConfig") {
		return m.SQLiteStore.DeleteProviderConfig(ctx, providerID, userID)
	}
	args := m.Called(providerID, userID)
	return args.Error(0)
}

func (m *mockedStellarStore) SetUserDefaultProvider(ctx context.Context, userID, configID string) error {
	if !m.hasExpectation("SetUserDefaultProvider") {
		return m.SQLiteStore.SetUserDefaultProvider(ctx, userID, configID)
	}
	args := m.Called(userID, configID)
	return args.Error(0)
}

func (m *mockedStellarStore) UpdateProviderLatency(ctx context.Context, id string, latencyMs int) error {
	if !m.hasExpectation("UpdateProviderLatency") {
		return m.SQLiteStore.UpdateProviderLatency(ctx, id, latencyMs)
	}
	args := m.Called(id, latencyMs)
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

	h := NewHandler(mockStore, nil)
	app.Post("/api/stellar/tasks", h.CreateTask)
	app.Patch("/api/stellar/tasks/:id/status", h.UpdateTaskStatus)
	app.Post("/api/stellar/memory/search", h.SearchMemory)
	app.Get("/api/stellar/providers", h.ListProviders)
	app.Post("/api/stellar/providers", h.CreateProvider)
	app.Delete("/api/stellar/providers/:id", h.DeleteProvider)
	app.Post("/api/stellar/providers/:id/default", h.SetDefaultProvider)
	app.Post("/api/stellar/providers/:id/test", h.TestProvider)

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

func TestStellarListProviders_MasksUserAPIKey(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)

	mockStore.On("GetUserProviderConfigs", userID).Return([]store.StellarProviderConfig{
		{
			ID:          "cfg-1",
			UserID:      userID,
			Provider:    "openai",
			DisplayName: "OpenAI",
			APIKeyEnc:   []byte("invalid-ciphertext"),
			IsActive:    true,
		},
	}, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Global []map[string]any              `json:"global"`
		User   []store.StellarProviderConfig `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload.Global)
	require.Len(t, payload.User, 1)
	assert.Empty(t, payload.User[0].APIKeyMask)
	mockStore.AssertExpectations(t)
}

func TestStellarListProviders_StoreErrorReturnsEmptyUser(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)
	mockStore.On("GetUserProviderConfigs", userID).Return(nil, errors.New("boom")).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		User []store.StellarProviderConfig `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Empty(t, payload.User)
	mockStore.AssertExpectations(t)
}

func TestStellarDeleteProvider_UsesUserAndID(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)
	mockStore.On("DeleteProviderConfig", "cfg-1", userID).Return(nil).Once()

	req, err := http.NewRequest(http.MethodDelete, "/api/stellar/providers/cfg-1", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestStellarSetDefaultProvider_UsesUserAndID(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)
	mockStore.On("SetUserDefaultProvider", userID, "cfg-2").Return(nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-2/default", bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestStellarTestProvider_SuccessUpdatesLatency(t *testing.T) {
	app, mockStore, userID := newMockedStellarHandlerApp(t)
	t.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	mockStore.On("GetUserProviderConfigs", userID).Return([]store.StellarProviderConfig{
		{ID: "cfg-ollama", UserID: userID, Provider: "ollama", BaseURL: server.URL, IsActive: true},
	}, nil).Once()
	mockStore.On("UpdateProviderLatency", "cfg-ollama", mock.MatchedBy(func(latency int) bool {
		return latency >= 0
	})).Return(nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-ollama/test", bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, true, payload["available"])
	assert.Equal(t, "", payload["error"])
	latency, ok := payload["latencyMs"].(float64)
	require.True(t, ok)
	assert.GreaterOrEqual(t, latency, float64(0))
	assert.Less(t, latency, float64(10000))
	mockStore.AssertExpectations(t)
}

func TestStellarTestProvider_ErrorPaths(t *testing.T) {
	tests := []struct {
		name           string
		id             string
		configs        []store.StellarProviderConfig
		loadErr        error
		wantStatusCode int
		wantError      string
	}{
		{
			name:           "load failure",
			id:             "cfg-1",
			loadErr:        errors.New("load failed"),
			wantStatusCode: http.StatusInternalServerError,
			wantError:      "failed to load provider config",
		},
		{
			name:           "provider not found",
			id:             "missing",
			configs:        []store.StellarProviderConfig{{ID: "cfg-1", Provider: "openai", BaseURL: "https://example.com"}},
			wantStatusCode: http.StatusNotFound,
			wantError:      "provider not found",
		},
		{
			name: "invalid encrypted key",
			id:   "cfg-1",
			configs: []store.StellarProviderConfig{{
				ID:        "cfg-1",
				Provider:  "openai",
				BaseURL:   "https://example.com",
				APIKeyEnc: []byte("not-encrypted"),
			}},
			wantStatusCode: http.StatusBadRequest,
			wantError:      "invalid encrypted API key",
		},
		{
			name: "invalid base URL",
			id:   "cfg-1",
			configs: []store.StellarProviderConfig{{
				ID:       "cfg-1",
				Provider: "openai",
				BaseURL:  "http://example.com",
			}},
			wantStatusCode: http.StatusBadRequest,
			wantError:      "invalid provider baseUrl",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, mockStore, userID := newMockedStellarHandlerApp(t)
			mockStore.On("GetUserProviderConfigs", userID).Return(tt.configs, tt.loadErr).Once()

			req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/"+tt.id+"/test", bytes.NewReader([]byte(`{}`)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, tt.wantStatusCode, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, tt.wantError, payload["error"])
			mockStore.AssertExpectations(t)
		})
	}
}
