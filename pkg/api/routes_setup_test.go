package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
	teststore "github.com/kubestellar/console/pkg/test"
)

const (
	routeSetupTestJWTSecret = "route-setup-jwt-test-fixture" // #nosec G101 -- test fixture only
	routeSetupTestTimeoutMs = 5000
)

func newRouteSetupTestServer(t *testing.T, cfg Config) *Server {
	t.Helper()

	if cfg.JWTSecret == "" {
		cfg.JWTSecret = routeSetupTestJWTSecret
	}
	if cfg.DatabasePath == "" {
		cfg.DatabasePath = filepath.Join(t.TempDir(), "console.db")
	}

	middleware.InitUserValidation(nil)

	return &Server{
		app:                 fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		store:               &teststore.MockStore{},
		config:              cfg,
		hub:                 transport.NewHub(),
		notificationService: notifications.NewService(),
		persistenceStore:    store.NewPersistenceStore(filepath.Join(t.TempDir(), "persistence.json")),
		auth:                newAuthRuntime(),
		background:          newBackgroundServices(),
		lifecycle:           &serverLifecycle{},
	}
}

func registeredRoutes(app *fiber.App) map[string]fiber.Route {
	routes := make(map[string]fiber.Route)
	for _, route := range app.GetRoutes(true) {
		routes[route.Method+" "+route.Path] = route
	}
	return routes
}

func signedTestJWT(t *testing.T, secret string) string {
	t.Helper()

	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "route-tester",
		Role:        models.UserRoleAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-time.Minute)),
		},
	})

	signed, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

func TestSetupAuthRoutes_RegistersExpectedRoutesAndMiddleware(t *testing.T) {
	server := newRouteSetupTestServer(t, Config{})
	server.setupHealthRoutes()
	routes := server.setupAuthRoutes(server.app)

	require.NotNil(t, routes)
	require.NotNil(t, routes.publicAPI)
	require.NotNil(t, routes.api)
	require.NotNil(t, routes.jwtAuth)
	require.NotNil(t, routes.csrfGuard)
	require.NotNil(t, routes.publicLimiter)
	require.NotNil(t, routes.bodyGuard)
	require.NotNil(t, routes.analyticsBodyGuard)
	require.NotNil(t, routes.aiLimiter)
	require.NotNil(t, routes.feedback)

	registered := registeredRoutes(server.app)
	expected := []struct {
		name         string
		method       string
		path         string
		handlerCount int
	}{
		{name: "github login", method: http.MethodGet, path: "/auth/github", handlerCount: 3},
		{name: "github callback", method: http.MethodGet, path: "/auth/github/callback", handlerCount: 3},
		{name: "manifest setup", method: http.MethodGet, path: "/auth/manifest/setup", handlerCount: 2},
		{name: "manifest callback", method: http.MethodGet, path: "/auth/manifest/callback", handlerCount: 2},
		{name: "refresh token", method: http.MethodPost, path: "/auth/refresh", handlerCount: 5},
		{name: "logout", method: http.MethodPost, path: "/auth/logout", handlerCount: 5},
		{name: "feedback request", method: http.MethodPost, path: "/api/feedback/requests", handlerCount: 5},
	}

	for _, tt := range expected {
		t.Run(tt.name, func(t *testing.T) {
			route, ok := registered[tt.method+" "+tt.path]
			require.Truef(t, ok, "expected route %s %s to be registered", tt.method, tt.path)
			assert.Len(t, route.Handlers, tt.handlerCount)
		})
	}

	routes.api.Get("/protected-probe", func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusNoContent)
	})
	routes.api.Post("/protected-probe", func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusNoContent)
	})

	tests := []struct {
		name    string
		method  string
		path    string
		headers map[string]string
		want    int
	}{
		{
			name:   "public api remains unauthenticated",
			method: http.MethodGet,
			path:   "/api/version",
			want:   http.StatusOK,
		},
		{
			name:   "protected api get requires auth",
			method: http.MethodGet,
			path:   "/api/protected-probe",
			want:   http.StatusUnauthorized,
		},
		{
			name:   "protected api post enforces csrf first",
			method: http.MethodPost,
			path:   "/api/protected-probe",
			want:   http.StatusForbidden,
		},
		{
			name:   "protected api post with csrf still requires auth",
			method: http.MethodPost,
			path:   "/api/protected-probe",
			headers: map[string]string{
				middleware.CSRFHeaderName: middleware.CSRFHeaderValue,
			},
			want: http.StatusUnauthorized,
		},
		{
			name:   "refresh route enforces csrf first",
			method: http.MethodPost,
			path:   "/auth/refresh",
			want:   http.StatusForbidden,
		},
		{
			name:   "refresh route with csrf still requires auth",
			method: http.MethodPost,
			path:   "/auth/refresh",
			headers: map[string]string{
				middleware.CSRFHeaderName: middleware.CSRFHeaderValue,
			},
			want: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			resp, err := server.app.Test(req, routeSetupTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.want, resp.StatusCode)
		})
	}
}

func TestAPICoreRouteGroup_RegistersProtectedRoutes(t *testing.T) {
	server := newRouteSetupTestServer(t, Config{
		AuthConfig: AuthConfig{
			JWTSecret:  routeSetupTestJWTSecret,
			AgentToken: "agent-token",
		},
	})

	routes := server.setupAuthRoutes(server.app)
	server.setupAPICoreRoutes(routes)

	registered := registeredRoutes(server.app)
	expected := []struct {
		name   string
		method string
		path   string
	}{
		{name: "ping", method: http.MethodGet, path: "/api/ping"},
		{name: "agent token", method: http.MethodGet, path: "/api/agent/token"},
		{name: "current user get", method: http.MethodGet, path: "/api/me"},
		{name: "current user put", method: http.MethodPut, path: "/api/me"},
		{name: "settings get", method: http.MethodGet, path: "/api/settings"},
		{name: "settings put", method: http.MethodPut, path: "/api/settings"},
		{name: "dashboards list", method: http.MethodGet, path: "/api/dashboards"},
		{name: "dashboards create", method: http.MethodPost, path: "/api/dashboards"},
		{name: "cards move", method: http.MethodPost, path: "/api/cards/:id/move"},
		{name: "mission validate", method: http.MethodPost, path: "/api/missions/validate"},
		{name: "mission gaps", method: http.MethodGet, path: "/api/missions/gaps"},
		{name: "orbit missions", method: http.MethodGet, path: "/api/orbit/missions"},
		{name: "notification test", method: http.MethodPost, path: "/api/notifications/test"},
		{name: "persistence config", method: http.MethodGet, path: "/api/persistence/config"},
		{name: "kubara catalog", method: http.MethodGet, path: "/api/kubara/catalog"},
	}

	for _, tt := range expected {
		t.Run(tt.name, func(t *testing.T) {
			_, ok := registered[tt.method+" "+tt.path]
			assert.Truef(t, ok, "expected route %s %s to be registered", tt.method, tt.path)
		})
	}

	unauthenticated := []struct {
		name    string
		method  string
		path    string
		headers map[string]string
		want    int
	}{
		{name: "ping requires auth", method: http.MethodGet, path: "/api/ping", want: http.StatusUnauthorized},
		{name: "agent token requires auth", method: http.MethodGet, path: "/api/agent/token", want: http.StatusUnauthorized},
		{name: "current user get requires auth", method: http.MethodGet, path: "/api/me", want: http.StatusUnauthorized},
		{name: "current user put enforces csrf first", method: http.MethodPut, path: "/api/me", want: http.StatusForbidden},
		{
			name:   "current user put with csrf still requires auth",
			method: http.MethodPut,
			path:   "/api/me",
			headers: map[string]string{
				middleware.CSRFHeaderName: middleware.CSRFHeaderValue,
			},
			want: http.StatusUnauthorized,
		},
	}

	for _, tt := range unauthenticated {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			resp, err := server.app.Test(req, routeSetupTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.want, resp.StatusCode)
		})
	}

	req := httptest.NewRequest(http.MethodGet, "/api/agent/token", nil)
	req.Header.Set("Authorization", "Bearer "+signedTestJWT(t, routeSetupTestJWTSecret))

	resp, err := server.app.Test(req, routeSetupTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "agent-token", body["token"])
}
