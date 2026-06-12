package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockStellarPrefsStore struct {
	Store
	prefs *store.StellarPreferences
	err   error
}

func (m *mockStellarPrefsStore) GetStellarPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error) {
	return m.prefs, m.err
}

func (m *mockStellarPrefsStore) UpdateStellarPreferences(ctx context.Context, prefs *store.StellarPreferences) error {
	m.prefs = prefs
	return m.err
}

func TestGetPreferences(t *testing.T) {
	tests := []struct {
		name           string
		userID         string
		prefs          *store.StellarPreferences
		storeErr       error
		wantStatusCode int
	}{
		{
			name:   "successful get",
			userID: "user-123",
			prefs: &store.StellarPreferences{
				UserID:          "user-123",
				DefaultProvider: "claude",
				ExecutionMode:   "auto",
			},
			wantStatusCode: fiber.StatusOK,
		},
		{
			name:           "missing user ID",
			userID:         "",
			wantStatusCode: fiber.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := &mockStellarPrefsStore{
				prefs: tt.prefs,
				err:   tt.storeErr,
			}
			handler := &Handler{store: mockStore}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				if tt.userID != "" {
					c.Locals("stellarUserID", tt.userID)
				}
				return c.Next()
			})
			app.Get("/api/stellar/preferences", handler.GetPreferences)

			req := httptest.NewRequest("GET", "/api/stellar/preferences", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)
		})
	}
}

func TestUpdatePreferences(t *testing.T) {
	tests := []struct {
		name           string
		userID         string
		body           putStellarPreferencesRequest
		wantStatusCode int
		wantProvider   string
		wantMode       string
	}{
		{
			name:   "successful update",
			userID: "user-123",
			body: putStellarPreferencesRequest{
				DefaultProvider: "claude",
				ExecutionMode:   "manual",
				Timezone:        "UTC",
				ProactiveMode:   true,
				PinnedClusters:  []string{"cluster-1", "cluster-2"},
			},
			wantStatusCode: fiber.StatusOK,
			wantProvider:   "claude",
			wantMode:       "manual",
		},
		{
			name:   "empty values use defaults",
			userID: "user-123",
			body: putStellarPreferencesRequest{
				DefaultProvider: "",
				ExecutionMode:   "",
			},
			wantStatusCode: fiber.StatusOK,
			wantProvider:   stellarDefaultProviderPolicy,
			wantMode:       stellarDefaultExecutionMode,
		},
		{
			name:   "invalid execution mode",
			userID: "user-123",
			body: putStellarPreferencesRequest{
				ExecutionMode: "invalid-mode",
			},
			wantStatusCode: fiber.StatusBadRequest,
		},
		{
			name: "missing user ID",
			body: putStellarPreferencesRequest{
				DefaultProvider: "claude",
			},
			wantStatusCode: fiber.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := &mockStellarPrefsStore{
				prefs: &store.StellarPreferences{},
			}
			handler := &Handler{store: mockStore}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				if tt.userID != "" {
					c.Locals("stellarUserID", tt.userID)
				}
				return c.Next()
			})
			app.Put("/api/stellar/preferences", handler.UpdatePreferences)

			bodyBytes, err := json.Marshal(tt.body)
			require.NoError(t, err)

			req := httptest.NewRequest("PUT", "/api/stellar/preferences", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)

			if tt.wantStatusCode == fiber.StatusOK && mockStore.prefs != nil {
				assert.Equal(t, tt.wantProvider, mockStore.prefs.DefaultProvider)
				assert.Equal(t, tt.wantMode, mockStore.prefs.ExecutionMode)
			}
		})
	}
}

func TestUpdatePreferences_InvalidJSON(t *testing.T) {
	mockStore := &mockStellarPrefsStore{}
	handler := &Handler{store: mockStore}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("stellarUserID", "user-123")
		return c.Next()
	})
	app.Put("/api/stellar/preferences", handler.UpdatePreferences)

	req := httptest.NewRequest("PUT", "/api/stellar/preferences", bytes.NewReader([]byte("{invalid json")))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}
