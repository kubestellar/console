package auth

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
	t.Run("RequireAdmin", func(t *testing.T) {
		tests := []struct {
			name       string
			role       models.UserRole
			userFound  bool
			storeError bool
			nilStore   bool
			wantStatus int
		}{
			{"AdminAllowed", models.UserRoleAdmin, true, false, false, http.StatusOK},
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
						return RequireAdmin(c, nil)
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
						return RequireAdmin(c, mockStore)
					})
				}

				req := httptest.NewRequest("GET", "/test", nil)
				req.Host = "localhost"
				resp, _ := app.Test(req)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
				mockStore.AssertExpectations(t)
			})
		}
	})

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
				req.Host = "localhost"
				resp, _ := app.Test(req)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
			})
		}
	})

	t.Run("requireAdmin does not bootstrap first admin", func(t *testing.T) {
		app := fiber.New()
		mockStore := new(test.MockStore)
		userID := uuid.New()
		viewer := &models.User{ID: userID, Role: models.UserRoleViewer}

		mockStore.On("GetUser", userID).Return(viewer, nil).Once()

		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return requireAdmin(c, mockStore)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		assert.Equal(t, models.UserRoleViewer, viewer.Role)
		mockStore.AssertExpectations(t)
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
					return RequireViewerOrAbove(c, mockStore)
				})

				req := httptest.NewRequest("GET", "/test", nil)
				req.Host = "localhost"
				resp, _ := app.Test(req)
				assert.Equal(t, tt.wantStatus, resp.StatusCode)
			})
		}

		// The table above covers the nil-user 403, the invalid-role 403,
		// and the happy path for each valid role. It does NOT cover
		// (a) the nil-store short-circuit, or
		// (b) the store-returning-error arm that maps to
		//     StatusInternalServerError / "Failed to verify user role".
		// Both are asserted below.

		t.Run("NilStoreShortCircuit", func(t *testing.T) {
			// Nil store means we skip the check entirely (used at very
			// early boot). The helper must return nil without touching
			// the fiber context; the surrounding handler then decides
			// the response, so a plain 200 is expected here.
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				return RequireViewerOrAbove(c, nil)
			})
			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, _ := app.Test(req)
			assert.Equal(t, http.StatusOK, resp.StatusCode)
		})

		t.Run("StoreErrorMapsTo500", func(t *testing.T) {
			// GetUser returning an error must fail closed as a 500 with
			// the "Failed to verify user role" message — NOT be treated
			// as "user not found" (which would silently 403 legitimate
			// users on a transient DB blip).
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).
				Return(nil, assert.AnError)

			app.Get("/test", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return RequireViewerOrAbove(c, mockStore)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, _ := app.Test(req)
			assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	})
}
