package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const mockedMemoryHandlerUserID = "00000000-0000-0000-0000-000000000123"

type memoryListResponse struct {
	Items []store.StellarMemoryEntry `json:"items"`
	Limit int                        `json:"limit"`
}

type memoryErrorResponse struct {
	Error string `json:"error"`
}

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

func newMockedMemoryHandlerApp(t *testing.T, authenticated bool) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()

	mockStore := newMockedStellarStore(t)
	userID := mockedMemoryHandlerUserID
	handler := NewHandler(mockStore, nil)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		if authenticated {
			parsedUserID, err := uuid.Parse(userID)
			require.NoError(t, err)
			c.Locals("userID", parsedUserID)
		}
		return c.Next()
	})
	app.Get("/api/stellar/memory", handler.ListMemory)
	app.Post("/api/stellar/memory/search", handler.SearchMemory)
	app.Delete("/api/stellar/memory", handler.DeleteMemory)
	app.Delete("/api/stellar/memory/:id", handler.DeleteMemory)

	return app, mockStore, userID
}

func TestStellarListMemory(t *testing.T) {
	tests := []struct {
		name           string
		authenticated  bool
		path           string
		setupMock      func(*mockedStellarStore, string)
		wantStatusCode int
		wantItems      []store.StellarMemoryEntry
		wantLimit      int
	}{
		{
			name:          "success with filters and mock data",
			authenticated: true,
			path:          "/api/stellar/memory?cluster=prod-east&category=incident&limit=10&offset=2",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				expected := []store.StellarMemoryEntry{
					{ID: "mem-1", UserID: userID, Cluster: "prod-east", Category: "incident", Summary: "OOMKilled pod", Tags: []string{"pod", "restart"}},
				}
				mockStore.On("ListStellarMemoryEntries", userID, "prod-east", "incident", 10, 2).Return(expected, nil).Once()
			},
			wantStatusCode: http.StatusOK,
			wantItems: []store.StellarMemoryEntry{
				{ID: "mem-1", UserID: mockedMemoryHandlerUserID, Cluster: "prod-east", Category: "incident", Summary: "OOMKilled pod", Tags: []string{"pod", "restart"}},
			},
			wantLimit: 10,
		},
		{
			name:          "empty results use default limit",
			authenticated: true,
			path:          "/api/stellar/memory",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("ListStellarMemoryEntries", userID, "", "", stellarDefaultListLimit, 0).Return([]store.StellarMemoryEntry{}, nil).Once()
			},
			wantStatusCode: http.StatusOK,
			wantItems:      []store.StellarMemoryEntry{},
			wantLimit:      stellarDefaultListLimit,
		},
		{
			name:          "store errors return internal server error",
			authenticated: true,
			path:          "/api/stellar/memory?category=incident",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("ListStellarMemoryEntries", userID, "", "incident", stellarDefaultListLimit, 0).Return(nil, errors.New("boom")).Once()
			},
			wantStatusCode: http.StatusInternalServerError,
		},
		{
			name:           "unauthorized access is rejected",
			authenticated:  false,
			path:           "/api/stellar/memory",
			wantStatusCode: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, mockStore, userID := newMockedMemoryHandlerApp(t, tt.authenticated)
			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID)
			}

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)
			if tt.wantStatusCode == http.StatusOK {
				var payload memoryListResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, tt.wantLimit, payload.Limit)
				assert.Equal(t, tt.wantItems, payload.Items)
			}
			if tt.wantStatusCode == http.StatusInternalServerError {
				var payload memoryErrorResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, "failed to load memory", payload.Error)
			}
			if !tt.authenticated {
				mockStore.AssertNotCalled(t, "ListStellarMemoryEntries")
			}
			mockStore.AssertExpectations(t)
		})
	}
}

func TestStellarSearchMemory(t *testing.T) {
	tests := []struct {
		name           string
		authenticated  bool
		body           string
		setupMock      func(*mockedStellarStore, string)
		wantStatusCode int
		wantItems      []store.StellarMemoryEntry
		wantLimit      int
		wantError      string
	}{
		{
			name:          "success with trimmed query",
			authenticated: true,
			body:          `{"query":"  oomkilled  ","limit":7}`,
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				expected := []store.StellarMemoryEntry{
					{ID: "mem-2", UserID: userID, Cluster: "prod-west", Category: "incident", Summary: "CrashLoopBackOff investigation"},
				}
				mockStore.On("SearchStellarMemoryEntries", userID, "oomkilled", 7).Return(expected, nil).Once()
			},
			wantStatusCode: http.StatusOK,
			wantItems: []store.StellarMemoryEntry{
				{ID: "mem-2", UserID: mockedMemoryHandlerUserID, Cluster: "prod-west", Category: "incident", Summary: "CrashLoopBackOff investigation", Tags: nil},
			},
			wantLimit: 7,
		},
		{
			name:           "missing query parameter is rejected",
			authenticated:  true,
			body:           `{}`,
			wantStatusCode: http.StatusBadRequest,
			wantError:      "query is required",
		},
		{
			name:           "whitespace only query is rejected",
			authenticated:  true,
			body:           `{"query":"   "}`,
			wantStatusCode: http.StatusBadRequest,
			wantError:      "query is required",
		},
		{
			name:          "empty results succeed",
			authenticated: true,
			body:          `{"query":"network partition","limit":3}`,
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("SearchStellarMemoryEntries", userID, "network partition", 3).Return([]store.StellarMemoryEntry{}, nil).Once()
			},
			wantStatusCode: http.StatusOK,
			wantItems:      []store.StellarMemoryEntry{},
			wantLimit:      3,
		},
		{
			name:          "store errors return internal server error",
			authenticated: true,
			body:          `{"query":"network partition","limit":4}`,
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("SearchStellarMemoryEntries", userID, "network partition", 4).Return(nil, errors.New("search failed")).Once()
			},
			wantStatusCode: http.StatusInternalServerError,
			wantError:      "failed to search memory",
		},
		{
			name:           "unauthorized access is rejected",
			authenticated:  false,
			body:           `{"query":"oomkilled"}`,
			wantStatusCode: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, mockStore, userID := newMockedMemoryHandlerApp(t, tt.authenticated)
			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/stellar/memory/search", bytes.NewReader([]byte(tt.body)))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)
			switch tt.wantStatusCode {
			case http.StatusOK:
				var payload memoryListResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, tt.wantLimit, payload.Limit)
				assert.Equal(t, tt.wantItems, payload.Items)
			case http.StatusBadRequest, http.StatusInternalServerError:
				var payload memoryErrorResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, tt.wantError, payload.Error)
			}
			if !tt.authenticated {
				mockStore.AssertNotCalled(t, "SearchStellarMemoryEntries")
			}
			mockStore.AssertExpectations(t)
		})
	}
}

func TestStellarDeleteMemory(t *testing.T) {
	tests := []struct {
		name           string
		authenticated  bool
		path           string
		setupMock      func(*mockedStellarStore, string)
		wantStatusCode int
		wantError      string
	}{
		{
			name:          "success deletes memory entry",
			authenticated: true,
			path:          "/api/stellar/memory/mem-3",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("DeleteStellarMemoryEntry", userID, "mem-3").Return(nil).Once()
			},
			wantStatusCode: http.StatusNoContent,
		},
		{
			name:           "missing id parameter is rejected",
			authenticated:  true,
			path:           "/api/stellar/memory",
			wantStatusCode: http.StatusBadRequest,
			wantError:      "id is required",
		},
		{
			name:          "not found returns not found",
			authenticated: true,
			path:          "/api/stellar/memory/missing-entry",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("DeleteStellarMemoryEntry", userID, "missing-entry").Return(store.ErrNotFound).Once()
			},
			wantStatusCode: http.StatusNotFound,
			wantError:      "memory entry not found",
		},
		{
			name:          "store errors return internal server error",
			authenticated: true,
			path:          "/api/stellar/memory/mem-4",
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("DeleteStellarMemoryEntry", userID, "mem-4").Return(errors.New("delete failed")).Once()
			},
			wantStatusCode: http.StatusInternalServerError,
			wantError:      "failed to delete memory entry",
		},
		{
			name:           "unauthorized access is rejected",
			authenticated:  false,
			path:           "/api/stellar/memory/mem-5",
			wantStatusCode: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, mockStore, userID := newMockedMemoryHandlerApp(t, tt.authenticated)
			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID)
			}

			req := httptest.NewRequest(http.MethodDelete, tt.path, nil)
			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)
			if tt.wantError != "" {
				var payload memoryErrorResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, tt.wantError, payload.Error)
			}
			if !tt.authenticated || tt.wantError == "id is required" {
				mockStore.AssertNotCalled(t, "DeleteStellarMemoryEntry")
			}
			mockStore.AssertExpectations(t)
		})
	}
}
