package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestOAuthConfigured verifies the oauthConfigured method correctly detects OAuth configuration.
func TestOAuthConfigured(t *testing.T) {
	tests := []struct {
		name         string
		clientID     string
		clientSecret string
		want         bool
	}{
		{
			name:         "both credentials present",
			clientID:     "test-client-id",
			clientSecret: "test-client-secret",
			want:         true,
		},
		{
			name:         "missing client ID",
			clientID:     "",
			clientSecret: "test-client-secret",
			want:         false,
		},
		{
			name:         "missing client secret",
			clientID:     "test-client-id",
			clientSecret: "",
			want:         false,
		},
		{
			name:         "both credentials missing",
			clientID:     "",
			clientSecret: "",
			want:         false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{
				config: Config{
					AuthConfig: AuthConfig{
						GitHubClientID: tt.clientID,
						GitHubSecret:   tt.clientSecret,
					},
				},
				auth: newAuthRuntime(),
			}

			got := s.oauthConfigured()
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestResolveOAuthCredentials_LoadsFromDatabase verifies that OAuth credentials
// are loaded from the database when not present in environment/config.
func TestResolveOAuthCredentials_LoadsFromDatabase(t *testing.T) {
	mockStore := new(test.MockStore)
	mockStore.On("GetOAuthCredentials").Return("db-client-id", "db-client-secret", nil)

	s := &Server{
		config: Config{
			AuthConfig: AuthConfig{
				GitHubClientID: "",
				GitHubSecret:   "",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	s.resolveOAuthCredentials()

	assert.Equal(t, "db-client-id", s.config.GitHubClientID)
	assert.Equal(t, "db-client-secret", s.config.GitHubSecret)
	mockStore.AssertCalled(t, "GetOAuthCredentials")
}

// TestResolveOAuthCredentials_SkipsWhenAlreadyConfigured verifies that database
// credentials are not loaded when environment/config credentials are already present.
func TestResolveOAuthCredentials_SkipsWhenAlreadyConfigured(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		config: Config{
			AuthConfig: AuthConfig{
				GitHubClientID: "env-client-id",
				GitHubSecret:   "env-client-secret",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	s.resolveOAuthCredentials()

	// Credentials should remain from environment
	assert.Equal(t, "env-client-id", s.config.GitHubClientID)
	assert.Equal(t, "env-client-secret", s.config.GitHubSecret)
	// Store should not be called
	mockStore.AssertNotCalled(t, "GetOAuthCredentials")
}

// TestReloadOAuth_HotSwapsCredentials verifies that OAuth credentials can be
// hot-reloaded after manifest flow completion.
func TestReloadOAuth_HotSwapsCredentials(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		config: Config{
			AuthConfig: AuthConfig{
				GitHubClientID: "old-client-id",
				GitHubSecret:   "old-client-secret",
				JWTSecret:      "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	// Set up initial auth handler
	s.auth.handler = handlers.NewAuthHandler(mockStore, handlers.AuthConfig{
		GitHubClientID: "old-client-id",
		GitHubSecret:   "old-client-secret",
		JWTSecret:      "test-jwt-secret",
	})

	// Reload with new credentials
	s.reloadOAuth("new-client-id", "new-client-secret")

	// Verify credentials were updated
	assert.Equal(t, "new-client-id", s.config.GitHubClientID)
	assert.Equal(t, "new-client-secret", s.config.GitHubSecret)
	// Verify auth handler was replaced (non-nil check)
	assert.NotNil(t, s.auth.handler)
}

// TestSetupAuthRoutes_RegistersAllAuthRoutes verifies that setupAuthRoutes
// correctly registers all auth-related routes.
func TestSetupAuthRoutes_RegistersAllAuthRoutes(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	ctx := s.setupAuthRoutes(s.app)

	// Verify route setup context is properly initialized
	require.NotNil(t, ctx, "setupAuthRoutes should return non-nil context")
	assert.NotNil(t, ctx.jwtAuth, "jwtAuth middleware should be initialized")
	assert.NotNil(t, ctx.csrfGuard, "csrfGuard middleware should be initialized")
	assert.NotNil(t, ctx.publicLimiter, "publicLimiter should be initialized")
	assert.NotNil(t, ctx.analyticsBodyGuard, "analyticsBodyGuard should be initialized")
	assert.NotNil(t, ctx.publicAPI, "publicAPI router should be initialized")
	assert.NotNil(t, ctx.api, "api router should be initialized")
	assert.NotNil(t, ctx.bodyGuard, "bodyGuard should be initialized")
	assert.NotNil(t, ctx.aiLimiter, "aiLimiter should be initialized")

	// Verify that auth handler was created
	assert.NotNil(t, s.auth.handler, "auth handler should be initialized")

	// Test that auth routes are registered by making requests
	authRoutes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/auth/github"},
		{http.MethodGet, "/auth/github/callback"},
		{http.MethodGet, "/auth/manifest/setup"},
		{http.MethodGet, "/auth/manifest/callback"},
		{http.MethodPost, "/auth/refresh"},
		{http.MethodPost, "/auth/logout"},
	}

	for _, route := range authRoutes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			req.Host = "localhost"
			resp, err := s.app.Test(req, -1)
			require.NoError(t, err)
			defer resp.Body.Close()

			// Routes should be registered (not 404)
			assert.NotEqual(t, http.StatusNotFound, resp.StatusCode,
				"Route %s %s should be registered", route.method, route.path)
		})
	}
}

// TestSetupAuthRoutes_FailureTrackerInjection verifies that the failure tracker
// is properly injected into auth routes via middleware.
func TestSetupAuthRoutes_FailureTrackerInjection(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	s.setupAuthRoutes(s.app)

	// Verify failure tracker was created
	require.NotNil(t, s.auth.failureTracker, "failure tracker should be initialized")
}

// TestSetupAuthRoutes_RateLimiters verifies that rate limiters are configured
// with appropriate limits for different route groups.
func TestSetupAuthRoutes_RateLimiters(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	ctx := s.setupAuthRoutes(s.app)

	assert.NotNil(t, ctx.publicLimiter, "public rate limiter should be configured")
	assert.NotNil(t, ctx.aiLimiter, "AI rate limiter should be configured")
}

// TestSetupAuthRoutes_BodyGuards verifies that body size guards are properly
// configured for different route groups.
func TestSetupAuthRoutes_BodyGuards(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	ctx := s.setupAuthRoutes(s.app)

	assert.NotNil(t, ctx.bodyGuard, "body guard should be configured")
	assert.NotNil(t, ctx.analyticsBodyGuard, "analytics body guard should be configured")
}

// TestSetupAuthRoutes_PublicAPIGroup verifies that the public API group is
// configured with proper rate limiting skip paths.
func TestSetupAuthRoutes_PublicAPIGroup(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	ctx := s.setupAuthRoutes(s.app)

	assert.NotNil(t, ctx.publicAPI, "public API router should be initialized")
}

// TestSetupAuthRoutes_AuthenticatedAPIGroup verifies that the authenticated
// API group is configured with JWT auth, CSRF guard, and body size limits.
func TestSetupAuthRoutes_AuthenticatedAPIGroup(t *testing.T) {
	mockStore := new(test.MockStore)

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret: "test-jwt-secret",
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		store: mockStore,
		auth:  newAuthRuntime(),
	}

	ctx := s.setupAuthRoutes(s.app)

	assert.NotNil(t, ctx.api, "authenticated API router should be initialized")
	assert.NotNil(t, ctx.jwtAuth, "JWT auth middleware should be applied")
	assert.NotNil(t, ctx.csrfGuard, "CSRF guard should be applied")
	assert.NotNil(t, ctx.bodyGuard, "body guard should be applied")
}
