package admin

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/handlers"
)

// TestUserRegistrar_RegistersCurrentUserRoutes locks the /api/me route surface
// owned by the admin registrar (#23725).
func TestUserRegistrar_RegistersCurrentUserRoutes(t *testing.T) {
	app := fiber.New()
	NewUserRegistrar().Register(app, handlers.Deps{})

	registered := map[string]bool{}
	for _, stack := range app.Stack() {
		for _, route := range stack {
			registered[route.Method+" "+route.Path] = true
		}
	}

	require.True(t, registered["GET /api/me"], "expected GET /api/me to be registered")
	require.True(t, registered["PUT /api/me"], "expected PUT /api/me to be registered")
}

// TestUserRegistrar_PreservesMiddlewareOrdering guarantees the guard chain the
// route group supplies runs before the handler and in the given order.
func TestUserRegistrar_PreservesMiddlewareOrdering(t *testing.T) {
	app := fiber.New()
	calls := make([]string, 0, 2)
	guard := func(name string) fiber.Handler {
		return func(c *fiber.Ctx) error {
			calls = append(calls, name)
			return c.Next()
		}
	}

	NewUserRegistrar(guard("first"), func(c *fiber.Ctx) error {
		calls = append(calls, "second")
		// Stop before the real handler: this test asserts ordering, not
		// handler behavior (the zero-value Deps has no store).
		return c.SendStatus(fiber.StatusNoContent)
	}).Register(app, handlers.Deps{})

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/api/me", nil))
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, []string{"first", "second"}, calls)
}
