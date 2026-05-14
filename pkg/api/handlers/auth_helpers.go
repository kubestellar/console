package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// Package-level RBAC helpers shared across handlers (#6022).
//
// Historically each handler defined its own requireAdmin/requireEditorOrAdmin
// method tied to a handler struct. That pattern is fine for handlers with a
// single store reference, but means each new set of endpoints has to roll its
// own role-check plumbing. These helpers centralize the logic so gitops, cards,
// and any future handler with a store.Store dependency can enforce the same
// RBAC matrix without copy-pasting it.
//
// Error model matches the existing CardHandler.requireEditorOrAdmin in
// pkg/api/handlers/cards.go (#5999, #6010):
//   - nil store → dev/demo/test mode, check skipped
//   - store lookup error → 500 (backend broken, not user's fault)
//   - user not found → 403
//   - insufficient role → 403
//
// The helpers take a store.Store parameter rather than a handler receiver so
// they can be called from any handler without forcing every handler struct to
// embed a common base.

// shouldBootstrapAdmin reports whether the current deployment has no admin
// users yet. Self-hosted consoles bootstrap the first authenticated user to
// admin so the instance is manageable immediately after install (#13608).
func shouldBootstrapAdmin(ctx context.Context, s store.Store) (bool, error) {
	if s == nil {
		return true, nil
	}
	admins, _, _, err := s.CountUsersByRole(ctx)
	if err != nil {
		return false, err
	}
	return admins == 0, nil
}

// requireAdmin verifies the current request's user has the admin role. If the
// console has no admins yet, the current user is promoted so fresh self-hosted
// installs are not locked out of admin-only settings flows (#13608).
func requireAdmin(c *fiber.Ctx, s store.Store) error {
	if s == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify admin role")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	if user.Role != models.UserRoleAdmin {
		bootstrapAdmin, err := shouldBootstrapAdmin(c.UserContext(), s)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify admin role")
		}
		if bootstrapAdmin {
			user.Role = models.UserRoleAdmin
			if err := s.UpdateUser(c.UserContext(), user); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to bootstrap admin role")
			}
		}
	}
	if user.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
}

// requireEditorOrAdmin verifies the current request's user has at least the
// editor role. Viewer-role users and anonymous requests are rejected with 403.
// Use this for mutating endpoints (create/update/delete) where full admin
// privileges are not required. Called from gitops mutation handlers to gate
// sync, helm upgrade/uninstall/rollback, and ArgoCD sync (#6022).
func requireEditorOrAdmin(c *fiber.Ctx, s store.Store) error {
	if s == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify user role")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "User not found")
	}
	if user.Role != models.UserRoleAdmin && user.Role != models.UserRoleEditor {
		return fiber.NewError(fiber.StatusForbidden, "Editor or admin role required")
	}
	return nil
}

// requireViewerOrAbove verifies the current request's user has at least the
// viewer role — effectively "any known, authenticated user in the console user
// store". Use this for read endpoints that should still require a valid user
// identity (not just a valid JWT). Drift detection is classified as read-only
// but sensitive enough to warrant this check (#6022).
func requireViewerOrAbove(c *fiber.Ctx, s store.Store) error {
	if s == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify user role")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "User not found")
	}
	switch user.Role {
	case models.UserRoleAdmin, models.UserRoleEditor, models.UserRoleViewer:
		return nil
	default:
		return fiber.NewError(fiber.StatusForbidden, "Valid console role required")
	}
}
