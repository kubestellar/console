package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestAuthHelpers(t *testing.T) {
	t.Run("requireEditorOrAdmin", func(t *testing.T) {
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
						return requireEditorOrAdmin(c, nil)
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
						return requireEditorOrAdmin(c, mockStore)
					})
				}

				req := httptest.NewRequest("GET", "/test", nil)
				resp, _ := app.Test(req)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
			})
		}
	})

	t.Run("requireAdmin bootstraps first admin", func(t *testing.T) {
		app := fiber.New()
		mockStore := new(test.MockStore)
		userID := uuid.New()
		viewer := &models.User{ID: userID, Role: models.UserRoleViewer}

		mockStore.On("GetUser", userID).Return(viewer, nil).Once()
		mockStore.On("CountUsersByRole").Return(0, 0, 1, nil).Once()
		mockStore.On("UpdateUser", viewer).Return(nil).Once()

		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return requireAdmin(c, mockStore)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, models.UserRoleAdmin, viewer.Role)
	})

	t.Run("requireViewerOrAbove", func(t *testing.T) {
		tests := []struct {
			name       string
			role       models.UserRole
			userFound  bool
			wantStatus int
		}{
			{"AdminAllowed", models.UserRoleAdmin, true, http.StatusOK},
			{"EditorAllowed", models.UserRoleEditor, true, http.StatusOK},
			{"ViewerAllowed", models.UserRoleViewer, true, http.StatusOK},
			{"InvalidRoleForbidden", models.UserRole("invalid"), true, http.StatusForbidden},
			{"UserNotFound", models.UserRole(""), false, http.StatusForbidden},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				app := fiber.New()
				mockStore := new(test.MockStore)
				userID := uuid.New()

				if !tt.userFound {
					mockStore.On("GetUser", userID).Return(nil, nil)
				} else {
					mockStore.On("GetUser", userID).Return(&models.User{Role: tt.role}, nil)
				}

				app.Get("/test", func(c *fiber.Ctx) error {
					c.Locals("userID", userID)
					return requireViewerOrAbove(c, mockStore)
				})

				req := httptest.NewRequest("GET", "/test", nil)
				resp, _ := app.Test(req)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
			})
		}
	})
}
