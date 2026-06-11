package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// requireAdmin re-exports auth.RequireAdmin for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
func requireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}

// requireEditorOrAdmin re-exports auth.RequireEditorOrAdmin for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
func requireEditorOrAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireEditorOrAdmin(c, s)
}

// requireAdminCheck re-exports auth.RequireAdminCheck for backward compatibility.
// New code should import github.com/kubestellar/console/pkg/api/handlers/auth directly.
func requireAdminCheck(user *models.User) error {
	return auth.RequireAdminCheck(user)
}
