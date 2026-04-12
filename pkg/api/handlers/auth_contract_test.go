package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAuthRefreshContract_TokenInResponseBody is a CONTRACT test.
// The AuthCallback frontend component requires the "token" field in
// the /auth/refresh response. Removing it breaks OAuth login.
// See: commit 25e464fa (broke it), commit be946db9 (fixed it).
// DO NOT remove this test without updating AuthCallback.tsx.
func TestAuthRefreshContract_TokenInResponseBody(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Post("/auth/refresh", handler.RefreshToken)

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

	// CONTRACT: "token" field must be present and non-empty.
	// AuthCallback.tsx does: const token = data.token
	// If this assertion fails, OAuth login is broken.
	tokenVal, hasToken := body["token"]
	assert.True(t, hasToken,
		"CONTRACT VIOLATION: response must contain 'token' field — "+
			"AuthCallback.tsx depends on it for OAuth login")
	tokenStr, ok := tokenVal.(string)
	assert.True(t, ok && tokenStr != "",
		"CONTRACT VIOLATION: 'token' must be a non-empty string")

	// CONTRACT: "onboarded" field must be present and boolean.
	// AuthCallback.tsx does: const isOnboarded = data.onboarded ?? onboarded
	onboardedVal, hasOnboarded := body["onboarded"]
	assert.True(t, hasOnboarded,
		"CONTRACT VIOLATION: response must contain 'onboarded' field — "+
			"AuthCallback.tsx depends on it")
	_, isBool := onboardedVal.(bool)
	assert.True(t, isBool,
		"CONTRACT VIOLATION: 'onboarded' must be a boolean")
}

// TestAuthRefreshContract_OnboardedFalse verifies the contract holds when
// the user has NOT completed onboarding (onboarded=false).
func TestAuthRefreshContract_OnboardedFalse(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Post("/auth/refresh", handler.RefreshToken)

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

	// Token must still be present regardless of onboarded status.
	tokenVal, hasToken := body["token"]
	assert.True(t, hasToken, "token must be in response even when onboarded=false")
	tokenStr, ok := tokenVal.(string)
	assert.True(t, ok && tokenStr != "", "token must be non-empty")

	assert.Equal(t, false, body["onboarded"],
		"onboarded must reflect user's actual status")
}
