package stellar

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRequireUser(t *testing.T) {
	tests := []struct {
		name      string
		userID    string
		wantError bool
	}{
		{
			name:      "valid user ID",
			userID:    "00000000-0000-0000-0000-000000000001",
			wantError: false,
		},
		{
			name:      "missing user ID",
			userID:    "",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(test.MockStore)
			handler := &Handler{store: mockStore}

			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				if tt.userID != "" {
					// resolveStellarUserID checks middleware.GetUserID which reads from "userID" Locals
					parsedID, err := uuid.Parse(tt.userID)
					if err == nil {
						c.Locals("userID", parsedID)
					}
				}
				userID, err := handler.requireUser(c)
				if tt.wantError {
					require.Error(t, err)
					return err
				}
				require.NoError(t, err)
				assert.Equal(t, tt.userID, userID)
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req, -1)
			require.NoError(t, err)

			if tt.wantError {
				assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
			} else {
				assert.Equal(t, fiber.StatusOK, resp.StatusCode)
			}
		})
	}
}

type mockUserStore struct {
	Store
	user *models.User
	err  error
}

func (m *mockUserStore) GetUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	return m.user, m.err
}

func TestIsAdminUser(t *testing.T) {
	adminID := uuid.New()
	userID := uuid.New()

	tests := []struct {
		name     string
		userID   uuid.UUID
		userRole models.UserRole
		wantAdmin bool
	}{
		{
			name:     "admin user",
			userID:   adminID,
			userRole: models.UserRoleAdmin,
			wantAdmin: true,
		},
		{
			name:     "regular user",
			userID:   userID,
			userRole: models.UserRoleViewer,
			wantAdmin: false,
		},
		{
			name:     "nil user ID",
			userID:   uuid.Nil,
			wantAdmin: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var mockStore Store = &mockUserStore{
				user: &models.User{ID: tt.userID, Role: tt.userRole},
			}
			handler := &Handler{store: mockStore}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", tt.userID)
				return c.Next()
			})
			app.Get("/test", func(c *fiber.Ctx) error {
				isAdmin := handler.isAdminUser(c)
				assert.Equal(t, tt.wantAdmin, isAdmin)
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		})
	}
}
