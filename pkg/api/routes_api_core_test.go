package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
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

func TestAgentAutoUpdateProxyRequiresAdmin(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "non-admin user is forbidden", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "admin user is allowed", role: models.UserRoleAdmin, wantStatus: http.StatusNoContent},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New(fiber.Config{ErrorHandler: customErrorHandler})
			mockStore := new(teststore.MockStore)
			userID := uuid.New()

			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

			app.All("/api/agent/auto-update/:path", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				if err := handlers.RequireAdmin(c, mockStore); err != nil {
					return err
				}
				return c.SendStatus(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodPost, "/api/agent/auto-update/status", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

// newAgentTokenTestServer creates a minimal server with the given agentToken
// wired into the /api/agent/token route, using the same setup path as production.
func newAgentTokenTestServer(t *testing.T, agentToken string) *Server {
	t.Helper()
	t.Setenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS", "true")

	mockStore := &teststore.MockStore{}
	mockStore.On("ListClusterGroups").Return(map[string][]byte{}, nil).Maybe()
	mockStore.On("SaveClusterGroup", mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("DeleteClusterGroup", mock.Anything).Return(nil).Maybe()
	
	// Reset token revocation state from any previous tests that called
	// NewServer() → InitTokenRevocation, then t.Cleanup → ShutdownTokenRevocation.
	// Without this, the middleware's initOnce prevents re-initialization with
	// a fresh store, causing JWTAuth to fail closed when it sees store==nil (#20857).
	middleware.ResetTokenRevocationForTest()
	t.Cleanup(middleware.ResetTokenRevocationForTest)
	middleware.InitTokenRevocation(mockStore)
	middleware.InitUserValidation(mockStore)
	
	server := &Server{
		app:   fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		store: mockStore,
		config: Config{
			AuthConfig: AuthConfig{
				JWTSecret:  routeRegistrationJWTSecret,
				AgentToken: agentToken,
			},
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		hub:                 handlers.NewHub(),
		notificationService: notifications.NewService(),
		persistenceStore:    store.NewPersistenceStore("testdata/persistence-agent-token.json"),
		lifecycle:           &serverLifecycle{},
		auth:                newAuthRuntime(),
		background:          newBackgroundServices(),
		quantumCache:        newQuantumWorkloadCache(),
	}
	server.setupRoutes()
	return server
}

// TestAgentTokenEndpoint_Contract is a CONTRACT test for #10398/#17669.
//
// The /api/agent/token endpoint:
//   - MUST require authentication (401 for unauthenticated callers so the
//     agent shared secret is never exposed to anonymous requests).
//   - MUST return {"token": "<KC_AGENT_TOKEN>"} for any authenticated user
//     (the frontend uses this to configure agentFetch for all kc-agent calls).
//   - MUST return {"token": ""} when no KC_AGENT_TOKEN is configured (so the
//     frontend can detect the "no agent" case gracefully).
//
// This test mirrors the runtime assertions from the auth-login-smoke.yml
// workflow ("Test /api/agent/token requires auth" and "Test /api/agent/token
// endpoint" steps) so regressions are caught at unit-test time rather than
// only during the scheduled smoke run.
func TestAgentTokenEndpoint_Contract(t *testing.T) {
	const testAgentToken = "smoke-test-agent-token-do-not-use-in-prod" // #nosec G101 — test fixture

	t.Run("unauthenticated request returns 401 (no token leak)", func(t *testing.T) {
		server := newAgentTokenTestServer(t, testAgentToken)

		req := httptest.NewRequest(http.MethodGet, "/api/agent/token", nil)
		req.Host = "localhost"
		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
			"CONTRACT (#10398): /api/agent/token must reject unauthenticated callers — agent token would leak otherwise")
	})

	t.Run("authenticated request returns configured agent token", func(t *testing.T) {
		server := newAgentTokenTestServer(t, testAgentToken)
		userID := uuid.New()

		mockStore := server.store.(*teststore.MockStore)
		mockStore.On("GetUser", userID).Return(&models.User{
			ID:          userID,
			GitHubLogin: "test-user",
			Role:        models.UserRoleViewer,
		}, nil).Maybe()

		req := httptest.NewRequest(http.MethodGet, "/api/agent/token", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+signedRouteTestToken(t, userID, models.UserRoleViewer))

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusOK, resp.StatusCode,
			"authenticated user must reach /api/agent/token handler")

		var body map[string]interface{}
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&body),
			"response body must be valid JSON")

		tokenVal, hasToken := body["token"]
		require.True(t, hasToken,
			"CONTRACT (#17669): response must contain 'token' field")
		assert.Equal(t, testAgentToken, tokenVal,
			"CONTRACT (#10398): returned token must match the configured KC_AGENT_TOKEN")
	})

	t.Run("authenticated request with no agent configured returns empty token", func(t *testing.T) {
		server := newAgentTokenTestServer(t, "") // no KC_AGENT_TOKEN
		userID := uuid.New()

		mockStore := server.store.(*teststore.MockStore)
		mockStore.On("GetUser", userID).Return(&models.User{
			ID:          userID,
			GitHubLogin: "test-user",
			Role:        models.UserRoleViewer,
		}, nil).Maybe()

		req := httptest.NewRequest(http.MethodGet, "/api/agent/token", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+signedRouteTestToken(t, userID, models.UserRoleViewer))

		resp, err := server.app.Test(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]interface{}
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

		tokenVal, hasToken := body["token"]
		require.True(t, hasToken, "response must contain 'token' field even when unconfigured")
		assert.Equal(t, "", tokenVal,
			"empty KC_AGENT_TOKEN must be returned as empty string (not omitted)")
	})
}
