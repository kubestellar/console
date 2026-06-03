package api

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

func TestGPUMutationRoutesRequireAdmin(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "viewer cannot create reservations", method: http.MethodPost, path: "/api/gpu/reservations", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "viewer cannot update reservations", method: http.MethodPut, path: "/api/gpu/reservations/not-a-uuid", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "viewer cannot delete reservations", method: http.MethodDelete, path: "/api/gpu/reservations/not-a-uuid", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "admin reaches create handler", method: http.MethodPost, path: "/api/gpu/reservations", role: models.UserRoleAdmin, wantStatus: http.StatusBadRequest},
		{name: "admin reaches update handler", method: http.MethodPut, path: "/api/gpu/reservations/not-a-uuid", role: models.UserRoleAdmin, wantStatus: http.StatusBadRequest},
		{name: "admin reaches delete handler", method: http.MethodDelete, path: "/api/gpu/reservations/not-a-uuid", role: models.UserRoleAdmin, wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
			mockStore := new(teststore.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Maybe()
			mockStore.On("ListClusterGroups").Return(map[string][]byte{}, nil).Maybe()

			done := make(chan struct{})
			t.Cleanup(func() { close(done) })

			app.Use("/api", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})

			server := &Server{
				app:   app,
				store: mockStore,
				config: Config{
					ServerConfig: ServerConfig{DevMode: true},
				},
				done: done,
			}
			routes := &routeSetupContext{
				api: app.Group("/api"),
				bodyGuard: func(c *fiber.Ctx) error {
					return c.Next()
				},
				csrfGuard: func(c *fiber.Ctx) error {
					return c.Next()
				},
				jwtAuth: func(c *fiber.Ctx) error {
					return c.Next()
				},
			}
			server.setupIntegrationsRoutes(routes)

			req := httptest.NewRequest(tt.method, tt.path, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}
