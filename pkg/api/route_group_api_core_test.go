package api

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/require"
)

func TestAPICoreRouteGroup_RegistersExpectedRoutes(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	hub := transport.NewHub()
	notifService := notifications.NewService()
	persistStore := store.NewPersistenceStore("testdata/persistence-route-group-api-core.json")
	k8sClient := &k8s.MultiClusterClient{}
	done := make(chan struct{})
	
	cfg := Config{
		AuthConfig: AuthConfig{
			JWTSecret:  "test-secret",
			AgentToken: "test-agent-token",
		},
	}

	routeCtx := &routeSetupContext{
		api:       app.Group("/api"),
		bodyGuard: func(c *fiber.Ctx) error { return c.Next() },
		csrfGuard: func(c *fiber.Ctx) error { return c.Next() },
		jwtAuth:   func(c *fiber.Ctx) error { return c.Next() },
	}

	group := newAPICoreRouteGroup(app, mockStore, cfg, hub, notifService, persistStore, k8sClient, done)
	group.Register(routeCtx)

	routes := routeTable(app)

	expectedRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/ping"},
		{"GET", "/api/agent/token"},
		{"GET", "/api/me"},
		{"PUT", "/api/me"},
		{"GET", "/api/agent/auto-update/:path"},
		{"HEAD", "/api/agent/auto-update/:path"},
		{"POST", "/api/agent/auto-update/:path"},
		{"PUT", "/api/agent/auto-update/:path"},
		{"PATCH", "/api/agent/auto-update/:path"},
		{"DELETE", "/api/agent/auto-update/:path"},
		{"CONNECT", "/api/agent/auto-update/:path"},
		{"OPTIONS", "/api/agent/auto-update/:path"},
		{"TRACE", "/api/agent/auto-update/:path"},
		{"GET", "/api/github/token/status"},
		{"POST", "/api/github/token"},
		{"DELETE", "/api/github/token"},
		{"GET", "/api/github-pipelines"},
		{"POST", "/api/github-pipelines"},
		{"GET", "/api/github-pipelines/health"},
		{"GET", "/api/agentic/detection-runs"},
		{"GET", "/api/github/*"},
		{"GET", "/api/acmm/scan"},
		{"GET", "/api/acmm/badge"},
		{"GET", "/api/settings"},
		{"PUT", "/api/settings"},
		{"POST", "/api/settings/export"},
		{"POST", "/api/settings/import"},
		{"GET", "/api/onboarding/questions"},
		{"POST", "/api/onboarding/responses"},
		{"POST", "/api/onboarding/complete"},
		{"GET", "/api/dashboards"},
		{"GET", "/api/dashboards/:id"},
		{"GET", "/api/dashboards/:id/export"},
		{"POST", "/api/dashboards/import"},
		{"POST", "/api/dashboards"},
		{"PUT", "/api/dashboards/:id"},
		{"DELETE", "/api/dashboards/:id"},
		{"GET", "/api/dashboards/:id/cards"},
		{"POST", "/api/dashboards/:id/cards"},
		{"PUT", "/api/cards/:id"},
		{"DELETE", "/api/cards/:id"},
		{"POST", "/api/cards/:id/focus"},
		{"POST", "/api/cards/:id/move"},
		{"GET", "/api/card-types"},
		{"GET", "/api/card-history"},
		{"GET", "/api/card-proxy"},
		{"GET", "/api/quantum/*"},
		{"POST", "/api/quantum/*"},
		{"DELETE", "/api/quantum/*"},
		{"GET", "/api/result/histogram"},
		{"GET", "/api/swaps"},
		{"POST", "/api/swaps/:id/snooze"},
		{"POST", "/api/swaps/:id/execute"},
		{"POST", "/api/swaps/:id/cancel"},
		{"POST", "/api/events"},
		{"GET", "/api/events"},
		{"POST", "/api/notifications/test"},
		{"POST", "/api/notifications/send"},
		{"GET", "/api/notifications/config"},
		{"POST", "/api/notifications/config"},
		{"GET", "/api/persistence/config"},
		{"PUT", "/api/persistence/config"},
		{"GET", "/api/persistence/status"},
		{"POST", "/api/persistence/sync"},
		{"POST", "/api/persistence/test"},
		{"GET", "/api/persistence/workloads"},
		{"GET", "/api/persistence/workloads/:name"},
		{"GET", "/api/persistence/groups"},
		{"GET", "/api/persistence/groups/:name"},
		{"GET", "/api/persistence/deployments"},
		{"GET", "/api/persistence/deployments/:name"},
		{"GET", "/api/nightly-e2e/runs"},
		{"GET", "/api/nightly-e2e/run-logs"},
		{"GET", "/api/kubara/catalog"},
		{"GET", "/api/kubara/config"},
	}

	for _, tc := range expectedRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected route %s to be registered", key)
	}
}

func TestAPICoreRouteGroup_MissionsSubroutes(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	hub := transport.NewHub()
	notifService := notifications.NewService()
	persistStore := store.NewPersistenceStore("testdata/persistence-route-group-api-core.json")
	k8sClient := &k8s.MultiClusterClient{}
	done := make(chan struct{})
	
	cfg := Config{
		AuthConfig: AuthConfig{
			JWTSecret: "test-secret",
		},
	}

	routeCtx := &routeSetupContext{
		api:       app.Group("/api"),
		bodyGuard: func(c *fiber.Ctx) error { return c.Next() },
		csrfGuard: func(c *fiber.Ctx) error { return c.Next() },
		jwtAuth:   func(c *fiber.Ctx) error { return c.Next() },
	}

	group := newAPICoreRouteGroup(app, mockStore, cfg, hub, notifService, persistStore, k8sClient, done)
	group.Register(routeCtx)

	routes := routeTable(app)

	missionsRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/missions"},
		{"POST", "/api/missions"},
		{"GET", "/api/missions/:id"},
		{"PUT", "/api/missions/:id"},
		{"DELETE", "/api/missions/:id"},
	}

	for _, tc := range missionsRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected missions route %s to be registered", key)
	}
}

func TestAPICoreRouteGroup_OrbitSubroutes(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	hub := transport.NewHub()
	notifService := notifications.NewService()
	persistStore := store.NewPersistenceStore("testdata/persistence-route-group-api-core.json")
	k8sClient := &k8s.MultiClusterClient{}
	done := make(chan struct{})
	
	cfg := Config{
		ServerConfig: ServerConfig{
			DatabasePath: "./data/test.db",
		},
		AuthConfig: AuthConfig{
			JWTSecret: "test-secret",
		},
	}

	routeCtx := &routeSetupContext{
		api:       app.Group("/api"),
		bodyGuard: func(c *fiber.Ctx) error { return c.Next() },
		csrfGuard: func(c *fiber.Ctx) error { return c.Next() },
		jwtAuth:   func(c *fiber.Ctx) error { return c.Next() },
	}

	group := newAPICoreRouteGroup(app, mockStore, cfg, hub, notifService, persistStore, k8sClient, done)
	group.Register(routeCtx)

	routes := routeTable(app)

	orbitRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/orbit/snapshot"},
		{"POST", "/api/orbit/snapshot"},
		{"GET", "/api/orbit/snapshots"},
		{"DELETE", "/api/orbit/snapshots/:id"},
		{"POST", "/api/orbit/restore/:id"},
		{"GET", "/api/orbit/schedule"},
		{"PUT", "/api/orbit/schedule"},
	}

	for _, tc := range orbitRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected orbit route %s to be registered", key)
	}
}

func TestAPICoreRouteGroup_MinHandlerChainLength(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	hub := transport.NewHub()
	notifService := notifications.NewService()
	persistStore := store.NewPersistenceStore("testdata/persistence-route-group-api-core.json")
	k8sClient := &k8s.MultiClusterClient{}
	done := make(chan struct{})
	
	cfg := Config{
		AuthConfig: AuthConfig{
			JWTSecret:  "test-secret",
			AgentToken: "test-agent-token",
		},
	}

	bodyGuardMiddleware := func(c *fiber.Ctx) error { return c.Next() }
	csrfGuardMiddleware := func(c *fiber.Ctx) error { return c.Next() }
	jwtAuthMiddleware := func(c *fiber.Ctx) error { return c.Next() }

	routeCtx := &routeSetupContext{
		api:       app.Group("/api"),
		bodyGuard: bodyGuardMiddleware,
		csrfGuard: csrfGuardMiddleware,
		jwtAuth:   jwtAuthMiddleware,
	}

	group := newAPICoreRouteGroup(app, mockStore, cfg, hub, notifService, persistStore, k8sClient, done)
	group.Register(routeCtx)

	routes := routeTable(app)

	protectedRoutes := []struct {
		method      string
		path        string
		minHandlers int
	}{
		{"GET", "/api/me", 3},
		{"PUT", "/api/me", 3},
	}

	for _, tc := range protectedRoutes {
		assertRegisteredRoute(t, routes, tc.method, tc.path, tc.minHandlers)
	}
}
