package dashboards

import (
	"io"
	"net/http/httptest"
	"strings"
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

// TestRegistrar_ImportRouteIsReachable dispatches a real request to
// POST /api/dashboards/import and asserts it lands in ImportDashboard rather
// than falling through to fiber's 404/405 handling. A route-order assertion
// cannot prove this: no parameterised POST sibling shares the segment count of
// /dashboards/import, so reachability is the only meaningful guard.
func TestRegistrar_ImportRouteIsReachable(t *testing.T) {
	app := fiber.New()
	NewRegistrar().Register(app.Group("/api"), handlers.Deps{})

	// An unsupported format is rejected by ImportDashboard before it touches
	// the store, so the nil Store in Deps is never dereferenced.
	req := httptest.NewRequest(fiber.MethodPost, "/api/dashboards/import",
		strings.NewReader(`{"format":"not-a-dashboard"}`))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusBadRequest, resp.StatusCode, "import route must be dispatched to ImportDashboard")
	require.Contains(t, string(body), "Unsupported format", "response must come from ImportDashboard, not a fallback handler")
}
