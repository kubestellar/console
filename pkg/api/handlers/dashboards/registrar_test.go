package dashboards

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/handlers"
)

// TestRegistrar_RegistersDashboardsDomainRoutes locks the route surface the
// dashboards registrar owns so future ports cannot silently drop a route
// (#23725). The expected list is transcribed from the pre-refactor
// route_group_api_core.go block.
func TestRegistrar_RegistersDashboardsDomainRoutes(t *testing.T) {
	app := fiber.New()
	NewRegistrar().Register(app.Group("/api"), handlers.Deps{})

	registered := map[string]bool{}
	for _, stack := range app.Stack() {
		for _, route := range stack {
			registered[route.Method+" "+route.Path] = true
		}
	}

	expected := []string{
		"GET /api/dashboards",
		"GET /api/dashboards/:id",
		"GET /api/dashboards/:id/export",
		"POST /api/dashboards/import",
		"POST /api/dashboards",
		"PUT /api/dashboards/:id",
		"DELETE /api/dashboards/:id",
		"GET /api/dashboards/:id/cards",
		"POST /api/dashboards/:id/cards",
		"PUT /api/cards/:id",
		"DELETE /api/cards/:id",
		"POST /api/cards/:id/focus",
		"POST /api/cards/:id/move",
		"GET /api/card-types",
		"GET /api/card-history",
	}

	for _, route := range expected {
		require.Truef(t, registered[route], "expected dashboards registrar to register %s", route)
	}
}

// TestRegistrar_PreservesImportBeforeParamRouteOrder guards fiber's
// first-registered-wins matching: POST /dashboards/import must be reachable
// and not shadowed by a parameterised sibling.
func TestRegistrar_PreservesImportBeforeParamRouteOrder(t *testing.T) {
	app := fiber.New()
	NewRegistrar().Register(app.Group("/api"), handlers.Deps{})

	var postPaths []string
	for _, stack := range app.Stack() {
		for _, route := range stack {
			if route.Method == fiber.MethodPost {
				postPaths = append(postPaths, route.Path)
			}
		}
	}

	importIdx, paramIdx := -1, -1
	for i, p := range postPaths {
		switch p {
		case "/api/dashboards/import":
			importIdx = i
		case "/api/dashboards/:id/cards":
			paramIdx = i
		}
	}
	require.NotEqual(t, -1, importIdx, "POST /api/dashboards/import must be registered")
	require.NotEqual(t, -1, paramIdx, "POST /api/dashboards/:id/cards must be registered")
	require.Less(t, importIdx, paramIdx, "import route must be registered before the parameterised card route")
}
