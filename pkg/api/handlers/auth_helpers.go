package handlers

import (
	"context"
	"os"
	"strings"

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
// users yet AND bootstrap has not already been attempted. Self-hosted consoles
// bootstrap the first authenticated user to admin so the instance is manageable
// immediately after install (#13608).
//
// SECURITY FIX (#16485): Bootstrap is now restricted to:
// - Initial setup only (not re-triggered if all admins are deleted)
// - Explicit opt-in via BOOTSTRAP_ADMIN_ALLOWED=true environment variable
// - During the initial user creation in auth_handler.go, not on every admin check
//
// This prevents privilege escalation if all admins are removed (manually, via
// bug, or via DB corruption) where the next viewer to hit an admin endpoint
// would be silently promoted.
func shouldBootstrapAdmin(ctx context.Context, s store.Store) (bool, error) {
	if s == nil {
		return true, nil
	}

	// Check if bootstrap is explicitly disabled
	bootstrapAllowed := strings.EqualFold(
		strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_ALLOWED")),
		"true",
	)
	if !bootstrapAllowed {
		return false, nil
	}

	admins, _, _, err := s.CountUsersByRole(ctx)
	if err != nil {
		return false, err
	}
	return admins == 0, nil
}

// RequireAdmin verifies the current request's user has the admin role. Exported
// for route setup code that needs to enforce admin access before returning
// sensitive data.
func RequireAdmin(c *fiber.Ctx, s store.Store) error {
	return requireAdmin(c, s)
}

// requireAdmin verifies the current request's user has the admin role.
// Unlike initial OAuth login flow, requireAdmin does NOT auto-promote users
// to admin even if admin count is zero. This prevents privilege escalation
// if all admins are removed (CWE-269: Improper Privilege Management #16485).
//
// Bootstrap promotion now only occurs during initial user creation in the
// auth_handler.go OAuth flow, and is gated by BOOTSTRAP_ADMIN_ALLOWED.
func requireAdmin(c *fiber.Ctx, s store.Store) error {
	if s == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify admin role")
	}
	return requireAdminCheck(user)
}

// requireAdminCheck verifies that a user has the admin role. It's a lower-level
// helper that takes an already-fetched user, used by SaveToken to avoid
// duplicate GetUser calls when bootstrapping.
func requireAdminCheck(user *models.User) error {
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
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
