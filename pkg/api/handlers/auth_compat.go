package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// Type aliases for backward compatibility after auth extraction.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
type AuthHandler = auth.AuthHandler
type AuthConfig = auth.AuthConfig

// NewAuthHandler re-exports auth.NewAuthHandler for backward compatibility.
var NewAuthHandler = auth.NewAuthHandler

// requireAdmin re-exports auth.RequireAdmin for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
// RequireAdmin ensures the request is made by an admin user.
// Exported for use in sub-packages like gitops.
func RequireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}

// RequireAdmin re-exports auth.RequireAdmin (exported) for backward compatibility.
func RequireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}

// requireEditorOrAdmin re-exports auth.RequireEditorOrAdmin for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
func requireEditorOrAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireEditorOrAdmin(c, s)
}

// requireViewerOrAbove re-exports auth.RequireViewerOrAbove for backward compatibility.
func requireViewerOrAbove(c *fiber.Ctx, s store.Store) error {
	return auth.RequireViewerOrAbove(c, s)
}

// requireAdminCheck re-exports auth.RequireAdminCheck for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
func requireAdminCheck(user *models.User) error {
	return auth.RequireAdminCheck(user)
}

// clientAuthCookieName re-exports the cookie name constant for backward compatibility.
const clientAuthCookieName = auth.ClientAuthCookieName

// RequireEditorOrAdminMiddleware re-exports auth.RequireEditorOrAdminMiddleware for backward compatibility.
func RequireEditorOrAdminMiddleware(s store.Store) fiber.Handler {
	return auth.RequireEditorOrAdminMiddleware(s)
}
