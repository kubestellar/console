package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRequireAdminMiddleware(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "admin allowed", role: models.UserRoleAdmin, wantStatus: http.StatusOK},
		{name: "viewer rejected", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			userID := uuid.New()
			mockStore := &teststore.MockStore{}
			mockStore.On("GetUser", userID).Return(&models.User{
				ID:   userID,
				Role: tc.role,
			}, nil).Once()

			app := fiber.New()
			app.Get("/admin", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			}, RequireAdminMiddleware(mockStore), func(c *fiber.Ctx) error {
				return c.SendStatus(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/admin", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tc.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestRequireEditorOrAdminMiddleware(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "admin allowed", role: models.UserRoleAdmin, wantStatus: http.StatusOK},
		{name: "editor allowed", role: models.UserRoleEditor, wantStatus: http.StatusOK},
		{name: "viewer rejected", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			userID := uuid.New()
			mockStore := &teststore.MockStore{}
			mockStore.On("GetUser", userID).Return(&models.User{
				ID:   userID,
				Role: tc.role,
			}, nil).Once()

			app := fiber.New()
			app.Post("/edit", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			}, RequireEditorOrAdminMiddleware(mockStore), func(c *fiber.Ctx) error {
				return c.SendStatus(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodPost, "/edit", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tc.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}
