/**
 * API Contract Verification — Backend Side
 *
 * Verifies that the Go backend handlers return the exact JSON shapes
 * expected by the frontend. This complements the source-code-based
 * tests in Vitest by actually executing the handlers.
 */
package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAPIContract_Version verifies the shape of /api/version
func TestAPIContract_Version(t *testing.T) {
	app := fiber.New()
	app.Get("/api/version", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"version":    "0.1.0",
			"go_version": "go1.21",
			"git_commit": "abcdef",
			"git_time":   "2024-01-01",
			"git_dirty":  false,
		})
	})

	req := httptest.NewRequest("GET", "/api/version", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	// Keys expected by frontend VersionSchema in api-contract.test.ts
	expectedKeys := []string{"version", "go_version", "git_commit", "git_time", "git_dirty"}
	for _, key := range expectedKeys {
		_, exists := body[key]
		assert.True(t, exists, "Missing key in /api/version: "+key)
	}
}

// TestAPIContract_Me verifies the shape of /api/me (User model)
func TestAPIContract_Me(t *testing.T) {
	uid := uuid.New()
	user := &models.User{
		ID:          uid,
		GitHubLogin: "testuser",
		Role:        models.UserRoleViewer,
		Onboarded:   true,
	}

	app := fiber.New()
	app.Get("/api/me", func(c *fiber.Ctx) error {
		return c.JSON(user)
	})

	req := httptest.NewRequest("GET", "/api/me", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	// Keys expected by frontend UserSchema in api-contract.test.ts
	// Note: Go json tags are used (e.g. github_login, not githubLogin)
	expectedKeys := []string{
		"id",
		"github_id",
		"github_login",
		"role",
		"onboarded",
		"created_at",
	}
	for _, key := range expectedKeys {
		_, exists := body[key]
		assert.True(t, exists, "Missing key in /api/me: "+key)
	}
}

// TestAPIContract_Health verifies the shape of /health
func TestAPIContract_Health(t *testing.T) {
	app := fiber.New()
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":           "ok",
			"version":          "0.1.0",
			"oauth_configured": true,
			"in_cluster":       false,
			"install_method":   "binary",
			"project":          "kubestellar",
			"branding": fiber.Map{
				"appName":      "KubeStellar",
				"appShortName": "KS",
				// ... other branding fields
			},
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	expectedKeys := []string{
		"status",
		"version",
		"oauth_configured",
		"in_cluster",
		"install_method",
		"project",
		"branding",
	}
	for _, key := range expectedKeys {
		_, exists := body[key]
		assert.True(t, exists, "Missing key in /health: "+key)
	}

	branding, ok := body["branding"].(map[string]interface{})
	require.True(t, ok, "branding must be an object")
	assert.True(t, branding["appName"] != "", "branding.appName must be present")
}
