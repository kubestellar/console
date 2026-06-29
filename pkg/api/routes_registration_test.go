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
