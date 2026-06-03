package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/models"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestAgentAutoUpdateProxyRequiresAdmin(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "non-admin user is forbidden", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "admin user is allowed", role: models.UserRoleAdmin, wantStatus: http.StatusNoContent},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
			mockStore := new(teststore.MockStore)
			userID := uuid.New()

			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

			app.All("/api/agent/auto-update/:path", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				if err := handlers.RequireAdmin(c, mockStore); err != nil {
					return err
				}
				return c.SendStatus(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodPost, "/api/agent/auto-update/status", nil)
			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestSIEMExportEndpointsRequireAdmin(t *testing.T) {
	endpoints := []string{
		"/api/audit/export/summary",
		"/api/audit/export/destinations",
		"/api/audit/export/events",
	}
	accessTests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "non-admin user is forbidden", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "admin user is allowed", role: models.UserRoleAdmin, wantStatus: http.StatusOK},
	}

	for _, endpoint := range endpoints {
		endpoint := endpoint
		for _, tt := range accessTests {
			tt := tt
			t.Run(tt.name+" "+endpoint, func(t *testing.T) {
				app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
				mockStore := new(teststore.MockStore)
				userID := uuid.New()

				mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

				app.Use("/api", func(c *fiber.Ctx) error {
					c.Locals("userID", userID)
					return c.Next()
				})
				handlers.NewSIEMHandler(mockStore).RegisterRoutes(app.Group("/api"))

				req := httptest.NewRequest(http.MethodGet, endpoint, nil)
				resp, err := app.Test(req)
				assert.NoError(t, err)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
				mockStore.AssertExpectations(t)
			})
		}
	}
}
