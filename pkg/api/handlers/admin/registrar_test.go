package admin

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/handlers"
)

// TestRegistrar_RegistersAdminDomainRoutes locks the route surface the admin
// registrar owns so future ports cannot silently drop a route (#23725).
func TestRegistrar_RegistersAdminDomainRoutes(t *testing.T) {
	app := fiber.New()
	NewRegistrar().Register(app.Group("/api"), handlers.Deps{})

	registered := map[string]bool{}
	for _, stack := range app.Stack() {
		for _, route := range stack {
			registered[route.Method+" "+route.Path] = true
		}
	}

	expected := []string{
		"GET /api/settings",
		"PUT /api/settings",
		"POST /api/settings/export",
		"POST /api/settings/import",
		"GET /api/teams",
		"POST /api/teams",
		"GET /api/teams/mine",
		"GET /api/teams/:id",
		"PUT /api/teams/:id",
		"DELETE /api/teams/:id",
		"GET /api/teams/:id/members",
		"POST /api/teams/:id/members",
		"DELETE /api/teams/:id/members/:userId",
		"PUT /api/teams/:id/members/:userId/role",
		"GET /api/users",
		"PUT /api/users/:id/role",
		"DELETE /api/users/:id",
		"GET /api/users/summary",
		"GET /api/rbac/users",
		"GET /api/openshift/users",
		"GET /api/rbac/service-accounts",
		"GET /api/rbac/roles",
		"GET /api/rbac/bindings",
		"GET /api/admin/rate-limit-status",
	}

	for _, route := range expected {
		require.Truef(t, registered[route], "expected admin registrar to register %s", route)
	}
}
