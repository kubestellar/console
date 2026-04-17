package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAuthRefreshContract_TokenNotInResponseBody is a CONTRACT test enforcing
// the security invariant established by #6590: the refreshed JWT MUST NOT
// appear in the JSON response body. The token is delivered EXCLUSIVELY via
// the HttpOnly kc_auth cookie so JavaScript (and any XSS-injected script or
// browser extension content script) can never read it.
//
// Previously this test was inverted (asserting the token MUST be in the body)
// to defend a frontend-driven workaround that re-leaked the token via the
// JSON response. That defeated the purpose of HttpOnly and was the root cause
// of issues #8087, #8091, and #8092 — TestRefreshToken/Valid_token_refresh
// failed every nightly release because it correctly enforced #6590's contract.
//
// The frontend OAuth callback flow now bootstraps the session from the
// HttpOnly cookie via /api/me (which the JWTAuth middleware already accepts
// from the kc_auth cookie), so no token-in-body workaround is needed.
//
// DO NOT re-introduce a "token" field in the /auth/refresh JSON body.
func TestAuthRefreshContract_TokenNotInResponseBody(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Post("/auth/refresh", middleware.RequireCSRF(), handler.RefreshToken)

	// 1. Create a mock user and generate a valid JWT.
	uid := uuid.New()
	user := &models.User{ID: uid, GitHubLogin: "contract-test-user", Onboarded: true}
	token, err := handler.generateJWT(user)
	require.NoError(t, err, "generateJWT must succeed")

	// 2. Setup mock: GetUser returns the user.
	mockStore.On("GetUser", uid).Return(user, nil).Once()

	// 3. POST /auth/refresh with Authorization header + CSRF header.
	req := refreshReq("Bearer " + token)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode,
		"refresh must return 200 for a valid token")

	// 4. Decode and validate the response body.
	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body),
		"response body must be valid JSON")

	// CONTRACT (#6590): the JSON body must NOT include the token. It is
	// delivered exclusively via the HttpOnly kc_auth cookie.
	_, hasToken := body["token"]
	assert.False(t, hasToken,
		"CONTRACT VIOLATION (#6590): response must NOT contain 'token' field — "+
			"the refreshed JWT is delivered exclusively via the HttpOnly kc_auth cookie")

	// CONTRACT: "refreshed" field is the JS-visible success signal.
	assert.Equal(t, true, body["refreshed"],
		"response must contain 'refreshed: true' as the success signal")

	// CONTRACT: "onboarded" field must be present and boolean — the frontend
	// uses it to skip the onboarding flow on a successful re-auth.
	onboardedVal, hasOnboarded := body["onboarded"]
	assert.True(t, hasOnboarded,
		"response must contain 'onboarded' field for AuthCallback")
	_, isBool := onboardedVal.(bool)
	assert.True(t, isBool, "'onboarded' must be a boolean")

	// CONTRACT: the new JWT must be set on the kc_auth cookie.
	var cookieFound bool
	for _, ck := range resp.Cookies() {
		if ck.Name == "kc_auth" && ck.Value != "" {
			cookieFound = true
			break
		}
	}
	assert.True(t, cookieFound,
		"refreshed JWT must be set on the HttpOnly kc_auth cookie")
}

// TestAuthRefreshContract_OnboardedFalse verifies the contract holds when
// the user has NOT completed onboarding (onboarded=false). The token must
// still be cookie-only, never returned in the JSON body.
func TestAuthRefreshContract_OnboardedFalse(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Post("/auth/refresh", middleware.RequireCSRF(), handler.RefreshToken)

	uid := uuid.New()
	user := &models.User{ID: uid, GitHubLogin: "new-user", Onboarded: false}
	token, err := handler.generateJWT(user)
	require.NoError(t, err)

	mockStore.On("GetUser", uid).Return(user, nil).Once()

	req := refreshReq("Bearer " + token)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	// CONTRACT (#6590): no token in body regardless of onboarding state.
	_, hasToken := body["token"]
	assert.False(t, hasToken,
		"token must NOT appear in response body even when onboarded=false (#6590)")

	assert.Equal(t, false, body["onboarded"],
		"onboarded must reflect user's actual status")
}
