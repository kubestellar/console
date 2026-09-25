package admin

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/services/team"
	"github.com/kubestellar/console/pkg/settings"
)

type registrar struct{}

// NewRegistrar returns the admin domain registrar. It builds the admin,
// settings, teams and RBAC handlers from the shared dependency set and wires
// the same routes the api-core and governance route groups registered by hand
// before epic #23685 phase 2.
func NewRegistrar() handlers.Registrar {
	return registrar{}
}

func (registrar) Register(router fiber.Router, deps handlers.Deps) {
	settingsHandler := NewSettingsHandler(settings.GetSettingsManager(), deps.Store)
	router.Get("/settings", settingsHandler.GetSettings)
	router.Put("/settings", settingsHandler.SaveSettings)
	router.Post("/settings/export", settingsHandler.ExportSettings)
	router.Post("/settings/import", settingsHandler.ImportSettings)

	teams := NewTeamHandler(team.New(deps.Store, deps.Store))
	router.Get("/teams", teams.ListAllTeams)
	router.Post("/teams", teams.CreateTeam)
	router.Get("/teams/mine", teams.GetUserTeams)
	router.Get("/teams/:id", teams.GetTeam)
	router.Put("/teams/:id", teams.UpdateTeam)
	router.Delete("/teams/:id", teams.DeleteTeam)
	router.Get("/teams/:id/members", teams.ListTeamMembers)
	router.Post("/teams/:id/members", teams.AddTeamMember)
	router.Delete("/teams/:id/members/:userId", teams.RemoveTeamMember)
	router.Put("/teams/:id/members/:userId/role", teams.UpdateTeamMemberRole)

	rbac := NewRBACHandler(deps.Store, deps.K8sClient)
	router.Get("/users", rbac.ListConsoleUsers)
	router.Put("/users/:id/role", rbac.UpdateUserRole)
	router.Delete("/users/:id", rbac.DeleteConsoleUser)
	router.Get("/users/summary", rbac.GetUserManagementSummary)
	router.Get("/rbac/users", rbac.ListK8sUsers)
	router.Get("/openshift/users", rbac.ListOpenShiftUsers)
	router.Get("/rbac/service-accounts", rbac.ListK8sServiceAccounts)
	router.Get("/rbac/roles", rbac.ListK8sRoles)
	router.Get("/rbac/bindings", rbac.ListK8sRoleBindings)

	adminHandler := NewAdminHandler(deps.FailureTracker, deps.Store)
	router.Get("/admin/rate-limit-status", adminHandler.GetRateLimitStatus)
}
