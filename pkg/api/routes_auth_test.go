package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	teststore "github.com/kubestellar/console/pkg/test"
)

func newAuthRouteTestServer() (*Server, *routeSetupContext) {
	app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
	server := &Server{
		app:        app,
		store:      &teststore.MockStore{},
		config:     Config{AuthConfig: AuthConfig{JWTSecret: "test-jwt-secret"}},
		auth:       newAuthRuntime(),
		background: newBackgroundServices(),
		lifecycle:  newServerLifecycle(nil),
	}

	routes := server.setupAuthRoutes(app)
	return server, routes
}

func findRoute(routes []fiber.Route, method, path string) (fiber.Route, bool) {
	for _, route := range routes {
		if route.Method == method && route.Path == path {
			return route, true
		}
	}
	return fiber.Route{}, false
}

func TestSetupAuthRoutes_RegistersExpectedEndpoints(t *testing.T) {
	t.Parallel()

	server, _ := newAuthRouteTestServer()
	routes := server.app.GetRoutes()

	tests := []struct {
		name        string
		method      string
		path        string
		minHandlers int
	}{
		{name: "GitHub login route", method: http.MethodGet, path: "/auth/github", minHandlers: 3},
		{name: "GitHub callback route", method: http.MethodGet, path: "/auth/github/callback", minHandlers: 3},
		{name: "Manifest setup route", method: http.MethodGet, path: "/auth/manifest/setup", minHandlers: 2},
		{name: "Manifest callback route", method: http.MethodGet, path: "/auth/manifest/callback", minHandlers: 2},
		{name: "Refresh token route", method: http.MethodPost, path: "/auth/refresh", minHandlers: 5},
		{name: "Logout route", method: http.MethodPost, path: "/auth/logout", minHandlers: 5},
		{name: "Feedback request route", method: http.MethodPost, path: "/api/feedback/requests", minHandlers: 5},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			route, ok := findRoute(routes, tt.method, tt.path)
			require.Truef(t, ok, "expected route %s %s to be registered", tt.method, tt.path)
			assert.GreaterOrEqualf(t, len(route.Handlers), tt.minHandlers,
				"expected route %s %s to include middleware chain", tt.method, tt.path)
		})
	}
}

func TestSetupAuthRoutes_MiddlewareComposition(t *testing.T) {
	t.Parallel()

	server, routes := newAuthRouteTestServer()

	routes.api.Get("/private-probe", func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusNoContent)
	})
	routes.api.Post("/private-probe", func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusNoContent)
	})

	tests := []struct {
		name       string
		method     string
		path       string
		csrfHeader bool
		wantStatus int
	}{
		{name: "manifest setup route is unauthenticated", method: http.MethodGet, path: "/auth/manifest/setup", wantStatus: http.StatusOK},
		{name: "protected route blocks unauthenticated GET", method: http.MethodGet, path: "/api/private-probe", wantStatus: http.StatusUnauthorized},
		{name: "protected route enforces CSRF on POST", method: http.MethodPost, path: "/api/private-probe", wantStatus: http.StatusForbidden},
		{name: "protected route enforces JWT after CSRF passes", method: http.MethodPost, path: "/api/private-probe", csrfHeader: true, wantStatus: http.StatusUnauthorized},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			if tt.csrfHeader {
				req.Header.Set("X-Requested-With", "XMLHttpRequest")
			}

			resp, err := server.app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}
