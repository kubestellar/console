package missions

import (
	"context"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsDemoMode(t *testing.T) {
	tests := []struct {
		name     string
		header   string
		expected bool
	}{
		{name: "demo mode enabled", header: "true", expected: true},
		{name: "demo mode disabled", header: "false", expected: false},
		{name: "demo mode header missing", header: "", expected: false},
		{name: "demo mode invalid value - TRUE", header: "TRUE", expected: false},
		{name: "demo mode numeric 1", header: "1", expected: false},
		{name: "demo mode yes value", header: "yes", expected: false},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var result bool
			app.Get("/test", func(c *fiber.Ctx) error {
				result = isDemoMode(c)
				return c.SendStatus(200)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			if tt.header != "" {
				req.Header.Set("X-Demo-Mode", tt.header)
			}
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.NotNil(t, resp)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// mockStore is a test double for store interface used by requireAdmin
type mockStore struct {
	user *models.User
	err  error
}

func (m *mockStore) GetUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	return m.user, m.err
}

func TestRequireAdmin(t *testing.T) {
	adminID := uuid.New()
	userID := uuid.New()

	tests := []struct {
		name          string
		store         interface{ GetUser(context.Context, uuid.UUID) (*models.User, error) }
		userID        uuid.UUID
		expectError   bool
		expectedCode  int
		expectedMsg   string
	}{
		{
			name:         "nil store allows access",
			store:        nil,
			userID:       adminID,
			expectError:  false,
		},
		{
			name: "admin user allowed",
			store: &mockStore{
				user: &models.User{ID: adminID, Role: "admin"},
			},
			userID:      adminID,
			expectError: false,
		},
		{
			name: "non-admin user blocked",
			store: &mockStore{
				user: &models.User{ID: userID, Role: "user"},
			},
			userID:       userID,
			expectError:  true,
			expectedCode: fiber.StatusForbidden,
			expectedMsg:  "Console admin access required",
		},
		{
			name: "nil user blocked",
			store: &mockStore{
				user: nil,
			},
			userID:       userID,
			expectError:  true,
			expectedCode: fiber.StatusForbidden,
			expectedMsg:  "Console admin access required",
		},
		{
			name: "store error",
			store: &mockStore{
				err: fiber.NewError(fiber.StatusInternalServerError, "database error"),
			},
			userID:       adminID,
			expectError:  true,
			expectedCode: fiber.StatusInternalServerError,
			expectedMsg:  "Failed to verify admin access",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				c.Locals("userID", tt.userID)
				err := requireAdmin(c, tt.store)
				if err != nil {
					return err
				}
				return c.SendStatus(200)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.NotNil(t, resp)

			if tt.expectError {
				assert.Equal(t, tt.expectedCode, resp.StatusCode)
				body, _ := io.ReadAll(resp.Body)
				assert.Contains(t, string(body), tt.expectedMsg)
			} else {
				assert.Equal(t, 200, resp.StatusCode)
			}
		})
	}
}
