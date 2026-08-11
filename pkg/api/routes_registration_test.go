package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const routeRegistrationJWTSecret = "route-registration-test-secret"

func newRouteRegistrationServer(t *testing.T) (*Server, *teststore.MockStore) {
	t.Helper()
	t.Setenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS", "true")

	mockStore := &teststore.MockStore{}
	mockStore.On("ListClusterGroups").Return(map[string][]byte{}, nil).Maybe()
	mockStore.On("SaveClusterGroup", mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("DeleteClusterGroup", mock.Anything).Return(nil).Maybe()

	// Reset global middleware state so this test's mockStore is used for
	// token revocation and user validation, regardless of what previous tests
	// left behind (mirrors the pattern in newAgentTokenTestServer).
	middleware.ResetTokenRevocationForTest()
	t.Cleanup(middleware.ResetTokenRevocationForTest)
	middleware.InitTokenRevocation(mockStore)
	middleware.InitUserValidation(mockStore)

	server := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		store: mockStore,
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: routeRegistrationJWTSecret,
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		hub:                 handlers.NewHub(),
		notificationService: notifications.NewService(),
		persistenceStore:    store.NewPersistenceStore("testdata/persistence-route-registration.json"),
		lifecycle:           &serverLifecycle{},
		auth:                newAuthRuntime(),
		background:          newBackgroundServices(),
		quantumCache:        newQuantumWorkloadCache(),
	}
	server.setupRoutes()
	return server, mockStore
}

func routeTable(app *fiber.App) map[string]fiber.Route {
	routes := make(map[string]fiber.Route)
	for _, route := range app.GetRoutes(true) {
		routes[route.Method+" "+route.Path] = route
	}
	return routes
}

func assertRegisteredRoute(t *testing.T, routes map[string]fiber.Route, method, path string, minHandlers int) {
	t.Helper()
	key := method + " " + path
	route, ok := routes[key]
	require.Truef(t, ok, "expected %s to be registered", key)
	assert.GreaterOrEqualf(t, len(route.Handlers), minHandlers, "expected %s to keep its middleware chain", key)
}

func signedRouteTestToken(t *testing.T, userID uuid.UUID, role models.UserRole) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID:      userID,
		GitHubLogin: "route-tester",
		Role:        role,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})

	signed, err := token.SignedString([]byte(routeRegistrationJWTSecret))
	require.NoError(t, err)
	return signed
}

func TestSetupRoutes_RegistersCriticalAuthAndAPIRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method      string
		path        string
		minHandlers int
	}{
		{http.MethodGet, "/health", 1},
		{http.MethodGet, "/auth/github", 3},
		{http.MethodGet, "/auth/github/callback", 3},
		{http.MethodGet, "/auth/manifest/setup", 2},
		{http.MethodGet, "/auth/manifest/callback", 2},
		{http.MethodPost, "/auth/refresh", 5},
		{http.MethodPost, "/auth/logout", 5},
		{http.MethodPost, "/api/feedback/requests", 5},
		{http.MethodGet, "/api/medium/blog", 1},
		{http.MethodGet, "/api/me", 4},
		{http.MethodPut, "/api/me", 4},
		{http.MethodGet, "/api/agent/token", 1},
		{http.MethodPost, "/api/github/token", 1},
		{http.MethodDelete, "/api/github/token", 1},
		{http.MethodGet, "/api/settings", 1},
		{http.MethodGet, "/api/dashboards", 1},
		{http.MethodPost, "/webhooks/github", 1},
		{http.MethodGet, "/ws", 1},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, tc.minHandlers)
	}
}

func TestSetupRoutes_ProtectedEndpointsKeepAuthAndCSRFGuards(t *testing.T) {
	server, mockStore := newRouteRegistrationServer(t)

	t.Run("refresh requires csrf before jwt auth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(`{}`))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("refresh with csrf still requires jwt", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(`{}`))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("api me remains authenticated", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
		req.Host = "localhost"

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("admin-only github token route rejects viewer", func(t *testing.T) {
		viewerID := uuid.New()
		mockStore.On("GetUser", viewerID).Return(&models.User{
			ID:   viewerID,
			Role: models.UserRoleViewer,
		}, nil).Maybe()

		req := httptest.NewRequest(http.MethodPost, "/api/github/token", strings.NewReader(`{"token":"ghp_test"}`))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		req.Header.Set("Authorization", "Bearer "+signedRouteTestToken(t, viewerID, models.UserRoleViewer))

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Truef(t,
			resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusServiceUnavailable,
			"expected 403 or 503 (viewer must not reach the handler), got %d", resp.StatusCode)
	})
}

func TestSetupRoutes_RegistersGovernanceRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/teams"},
		{http.MethodPost, "/api/teams"},
		{http.MethodGet, "/api/teams/mine"},
		{http.MethodGet, "/api/teams/:id"},
		{http.MethodPut, "/api/teams/:id"},
		{http.MethodDelete, "/api/teams/:id"},
		{http.MethodGet, "/api/teams/:id/members"},
		{http.MethodPost, "/api/teams/:id/members"},
		{http.MethodDelete, "/api/teams/:id/members/:userId"},
		{http.MethodPut, "/api/teams/:id/members/:userId/role"},
		{http.MethodGet, "/api/users"},
		{http.MethodPut, "/api/users/:id/role"},
		{http.MethodDelete, "/api/users/:id"},
		{http.MethodGet, "/api/users/summary"},
		{http.MethodGet, "/api/admin/audit-log"},
		{http.MethodGet, "/api/namespaces"},
		{http.MethodGet, "/api/namespaces/:name/access"},
		{http.MethodGet, "/api/admin/rate-limit-status"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupRoutes_RegistersFeedbackRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/feedback/requests"},
		{http.MethodPost, "/api/feedback/requests"},
		{http.MethodGet, "/api/feedback/requests/:id"},
		{http.MethodPost, "/api/feedback/requests/:id/feedback"},
		{http.MethodGet, "/api/notifications"},
		{http.MethodGet, "/api/notifications/unread-count"},
		{http.MethodPost, "/api/notifications/:id/read"},
		{http.MethodPost, "/api/notifications/read-all"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupRoutes_RegistersStellarRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/stellar/preferences"},
		{http.MethodPut, "/api/stellar/preferences"},
		{http.MethodGet, "/api/stellar/state"},
		{http.MethodGet, "/api/stellar/digest"},
		{http.MethodGet, "/api/stellar/stream"},
		{http.MethodPost, "/api/stellar/ask"},
		{http.MethodGet, "/api/stellar/notifications"},
		{http.MethodPost, "/api/stellar/notifications/:id/read"},
		{http.MethodGet, "/api/stellar/missions"},
		{http.MethodPost, "/api/stellar/missions"},
		{http.MethodGet, "/api/stellar/missions/:id"},
		{http.MethodPut, "/api/stellar/missions/:id"},
		{http.MethodDelete, "/api/stellar/missions/:id"},
		{http.MethodGet, "/api/stellar/actions"},
		{http.MethodPost, "/api/stellar/actions"},
		{http.MethodGet, "/api/stellar/actions/:id"},
		{http.MethodPost, "/api/stellar/providers"},
		{http.MethodDelete, "/api/stellar/providers/:id"},
		{http.MethodGet, "/api/stellar/health"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupRoutes_RegistersPublicRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/active-users"},
		{http.MethodPost, "/api/active-users"},
		{http.MethodGet, "/api/medium/blog"},
		{http.MethodGet, "/api/youtube/playlist"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}

func TestSetupRoutes_RegistersAPICoreRoutes(t *testing.T) {
	server, _ := newRouteRegistrationServer(t)
	routes := routeTable(server.app)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/settings"},
		{http.MethodPut, "/api/settings"},
		{http.MethodGet, "/api/dashboards"},
		{http.MethodPost, "/api/dashboards"},
		{http.MethodGet, "/api/dashboards/:id"},
		{http.MethodPut, "/api/dashboards/:id"},
		{http.MethodDelete, "/api/dashboards/:id"},
		{http.MethodGet, "/api/dashboards/:id/cards"},
		{http.MethodPost, "/api/dashboards/:id/cards"},
		{http.MethodPut, "/api/cards/:id"},
		{http.MethodDelete, "/api/cards/:id"},
		{http.MethodGet, "/api/card-types"},
		{http.MethodGet, "/api/github/token/status"},
		{http.MethodPost, "/api/github/token"},
		{http.MethodDelete, "/api/github/token"},
	}

	for _, tc := range expected {
		assertRegisteredRoute(t, routes, tc.method, tc.path, 1)
	}
}
