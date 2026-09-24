package handlers

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/require"
)

func TestRequireAdmin(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		setupUser  func(t *testing.T, s *store.SQLiteStore) uuid.UUID
		wantStatus int
	}{
		{
			name: "admin user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "admin-user-" + id.String()[:8],
					Role:        models.UserRoleAdmin,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "editor user blocked",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "editor-user-" + id.String()[:8],
					Role:        models.UserRoleEditor,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusForbidden,
		},
		{
			name: "viewer user blocked",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "viewer-user-" + id.String()[:8],
					Role:        models.UserRoleViewer,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusForbidden,
		},
		{
			name: "no user blocked",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				return uuid.New()
			},
			wantStatus: fiber.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := store.OpenTestDB(t)
			app := fiber.New()
			userID := tt.setupUser(t, s)

			app.Get("/test", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				if err := RequireAdmin(c, s); err != nil {
					return err
				}
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestRequireEditorOrAdmin(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		setupUser  func(t *testing.T, s *store.SQLiteStore) uuid.UUID
		wantStatus int
	}{
		{
			name: "admin user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "admin-user-" + id.String()[:8],
					Role:        models.UserRoleAdmin,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "editor user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "editor-user-" + id.String()[:8],
					Role:        models.UserRoleEditor,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "viewer user blocked",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "viewer-user-" + id.String()[:8],
					Role:        models.UserRoleViewer,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := store.OpenTestDB(t)
			app := fiber.New()
			userID := tt.setupUser(t, s)

			app.Get("/test", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				if err := RequireEditorOrAdmin(c, s); err != nil {
					return err
				}
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestRequireViewerOrAbove(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		setupUser  func(t *testing.T, s *store.SQLiteStore) uuid.UUID
		wantStatus int
	}{
		{
			name: "admin user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "admin-user-" + id.String()[:8],
					Role:        models.UserRoleAdmin,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "editor user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "editor-user-" + id.String()[:8],
					Role:        models.UserRoleEditor,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "viewer user passes",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "viewer-user-" + id.String()[:8],
					Role:        models.UserRoleViewer,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "no user blocked",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				return uuid.New()
			},
			wantStatus: fiber.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := store.OpenTestDB(t)
			app := fiber.New()
			userID := tt.setupUser(t, s)

			app.Get("/test", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				if err := RequireViewerOrAbove(c, s); err != nil {
					return err
				}
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestRequireEditorOrAdminMiddleware(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		setupUser  func(t *testing.T, s *store.SQLiteStore) uuid.UUID
		wantStatus int
	}{
		{
			name: "admin user passes middleware",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "admin-user-" + id.String()[:8],
					Role:        models.UserRoleAdmin,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "editor user passes middleware",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "editor-user-" + id.String()[:8],
					Role:        models.UserRoleEditor,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name: "viewer user blocked by middleware",
			setupUser: func(t *testing.T, s *store.SQLiteStore) uuid.UUID {
				id := uuid.New()
				user := &models.User{
					ID:          id,
					GitHubID:    id.String(),
					GitHubLogin: "viewer-user-" + id.String()[:8],
					Role:        models.UserRoleViewer,
				}
				err := s.CreateUser(ctx, user)
				require.NoError(t, err)
				return user.ID
			},
			wantStatus: fiber.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := store.OpenTestDB(t)
			app := fiber.New()
			userID := tt.setupUser(t, s)

			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})

			app.Get("/test", RequireEditorOrAdminMiddleware(s), func(c *fiber.Ctx) error {
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

// TestRequireAdminCheckCompat exercises the backward-compat requireAdminCheck
// wrapper (re-exported from pkg/api/handlers/auth) directly, without going
// through a store lookup.
func TestRequireAdminCheckCompat(t *testing.T) {
	tests := []struct {
		name    string
		user    *models.User
		wantErr bool
	}{
		{"nil user", nil, true},
		{"non-admin user", &models.User{Role: models.UserRoleViewer}, true},
		{"admin user", &models.User{Role: models.UserRoleAdmin}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := requireAdminCheck(tt.user)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
