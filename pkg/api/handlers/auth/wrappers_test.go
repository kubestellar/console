package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

// mockDisconnecter is a stand-in for the WebSocket hub used to verify
// SetHub wires the field through.
type mockDisconnecter struct {
	calls int32
}

func (m *mockDisconnecter) DisconnectUser(uuid.UUID) {
	atomic.AddInt32(&m.calls, 1)
}

// TestRequireAdminCheck exercises the exported wrapper that takes an
// already-fetched *models.User (used by SaveToken to avoid duplicate
// GetUser calls). helpers_test.go covers the RequireAdmin middleware
// path but not this direct entry point.
func TestRequireAdminCheck(t *testing.T) {
	tests := []struct {
		name     string
		user     *models.User
		wantErr  bool
		wantCode int
	}{
		{
			name:     "nil user rejected",
			user:     nil,
			wantErr:  true,
			wantCode: fiber.StatusForbidden,
		},
		{
			name:     "viewer role rejected",
			user:     &models.User{Role: models.UserRoleViewer},
			wantErr:  true,
			wantCode: fiber.StatusForbidden,
		},
		{
			name:     "editor role rejected",
			user:     &models.User{Role: models.UserRoleEditor},
			wantErr:  true,
			wantCode: fiber.StatusForbidden,
		},
		{
			name:    "admin allowed",
			user:    &models.User{Role: models.UserRoleAdmin},
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := RequireAdminCheck(tt.user)
			if !tt.wantErr {
				assert.NoError(t, err)
				return
			}
			assert.Error(t, err)
			ferr, ok := err.(*fiber.Error)
			assert.True(t, ok, "expected *fiber.Error, got %T", err)
			assert.Equal(t, tt.wantCode, ferr.Code)
		})
	}
}

// TestRequireEditorOrAdminExported exercises the exported wrapper. The
// existing suite covers the internal requireEditorOrAdmin implementation
// only via the middleware; the wrapper — used by handlers that already
// have a fiber.Ctx and store.Store in hand — has been 0% covered.
func TestRequireEditorOrAdminExported(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		userFound  bool
		storeError bool
		nilStore   bool
		wantStatus int
	}{
		{"AdminAllowed", models.UserRoleAdmin, true, false, false, http.StatusOK},
		{"EditorAllowed", models.UserRoleEditor, true, false, false, http.StatusOK},
		{"ViewerForbidden", models.UserRoleViewer, true, false, false, http.StatusForbidden},
		{"UserNotFound", models.UserRole(""), false, false, false, http.StatusForbidden},
		{"StoreError", models.UserRole(""), false, true, false, http.StatusInternalServerError},
		{"NilStoreAllowed", models.UserRole(""), false, false, true, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()

			if tt.nilStore {
				app.Get("/test", func(c *fiber.Ctx) error {
					if err := RequireEditorOrAdmin(c, nil); err != nil {
						return err
					}
					return c.SendStatus(fiber.StatusOK)
				})
			} else {
				if tt.storeError {
					mockStore.On("GetUser", userID).Return(nil, assert.AnError)
				} else if !tt.userFound {
					mockStore.On("GetUser", userID).Return(nil, nil)
				} else {
					mockStore.On("GetUser", userID).Return(&models.User{Role: tt.role}, nil)
				}
				app.Get("/test", func(c *fiber.Ctx) error {
					c.Locals("userID", userID)
					if err := RequireEditorOrAdmin(c, mockStore); err != nil {
						return err
					}
					return c.SendStatus(fiber.StatusOK)
				})
			}

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, _ := app.Test(req)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

// TestAuthHandlerSetHubAndSSECanceller verifies the two logout-time
// wiring hooks store the provided values on the AuthHandler. Both
// setters have been 0% covered because their normal callers (the app
// wire-up in cmd/server) are not exercised by unit tests.
func TestAuthHandlerSetHubAndSSECanceller(t *testing.T) {
	h := &AuthHandler{}

	// SetHub with a real disconnecter is stored and invocable.
	hub := &mockDisconnecter{}
	h.SetHub(hub)
	if assert.NotNil(t, h.wsHub) {
		h.wsHub.DisconnectUser(uuid.New())
		assert.Equal(t, int32(1), atomic.LoadInt32(&hub.calls))
	}

	// SetHub(nil) clears the field — logout-on-disconnect can be
	// disabled after the fact.
	h.SetHub(nil)
	assert.Nil(t, h.wsHub)

	// SetSSECanceller stores a callable that is invoked with the
	// user's UUID when called.
	var seen uuid.UUID
	fn := func(id uuid.UUID) { seen = id }
	h.SetSSECanceller(fn)
	assert.NotNil(t, h.onLogoutSSE)

	target := uuid.New()
	h.onLogoutSSE(target)
	assert.Equal(t, target, seen)

	// Nil cancellers are permitted (used by tests / demo mode where no
	// SSE stream exists).
	h.SetSSECanceller(nil)
	assert.Nil(t, h.onLogoutSSE)
}

// silence unused import if the auth pkg drops context in the future.
var _ = context.TODO
