package handlers

import "github.com/kubestellar/console/pkg/api/handlers/admin"

// Type aliases allow call sites (e.g. route registration) to continue
// referring to handlers.AdminHandler, handlers.SettingsHandler, etc. after
// the admin/settings/user/teams/rbac handler files moved into their own
// pkg/api/handlers/admin subpackage (epic #23685 phase 1). New code should
// import pkg/api/handlers/admin directly.
type (
	AdminHandler    = admin.AdminHandler
	SettingsHandler = admin.SettingsHandler
	UserHandler     = admin.UserHandler
	TeamHandler     = admin.TeamHandler
	RBACHandler     = admin.RBACHandler
)

// Constructor re-exports delegating to the admin subpackage.
var (
	NewAdminHandler    = admin.NewAdminHandler
	NewSettingsHandler = admin.NewSettingsHandler
	NewUserHandler     = admin.NewUserHandler
	NewTeamHandler     = admin.NewTeamHandler
	NewRBACHandler     = admin.NewRBACHandler
)
