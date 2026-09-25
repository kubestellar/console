package persistence

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/store"
)

// TestRegistrar_RegistersPersistenceDomainRoutes locks the route surface the
// persistence registrar owns so future ports cannot silently drop a route
// (#23725). The expected list is transcribed from the pre-refactor
// route_group_api_core.go block.
func TestRegistrar_RegistersPersistenceDomainRoutes(t *testing.T) {
	app := fiber.New()
	// The persistence constructor installs callbacks on the store, so a real
	// (empty) store is required; every other dependency may be zero-valued.
	NewRegistrar().Register(app.Group("/api"), handlers.Deps{
		PersistenceStore: store.NewPersistenceStore(""),
	})

	registered := map[string]bool{}
	for _, stack := range app.Stack() {
		for _, route := range stack {
			registered[route.Method+" "+route.Path] = true
		}
	}

	expected := []string{
		"GET /api/persistence/config",
		"PUT /api/persistence/config",
		"GET /api/persistence/status",
		"POST /api/persistence/sync",
		"POST /api/persistence/test",
		"GET /api/persistence/workloads",
		"GET /api/persistence/workloads/:name",
		"GET /api/persistence/groups",
		"GET /api/persistence/groups/:name",
		"GET /api/persistence/deployments",
		"GET /api/persistence/deployments/:name",
	}

	for _, route := range expected {
		require.Truef(t, registered[route], "expected persistence registrar to register %s", route)
	}
}
