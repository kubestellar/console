package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGitHubProxyTestSettings(t *testing.T) {
	t.Helper()

	manager := settings.GetSettingsManager()
	settingsDir := t.TempDir()
	manager.SetSettingsPath(filepath.Join(settingsDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(settingsDir, ".keyfile"))
	require.NoError(t, manager.Load())

	all, err := manager.GetAll()
	require.NoError(t, err)
	all.FeedbackGitHubToken = ""
	all.FeedbackGitHubTokenSource = ""
	require.NoError(t, manager.SaveAll(all))
}

func TestSaveToken_BootstrapsFirstAdmin(t *testing.T) {
	setupGitHubProxyTestSettings(t)

	app := fiber.New()
	mockStore := new(test.MockStore)
	h := NewGitHubProxyHandler("", mockStore)
	userID := uuid.New()
	viewer := &models.User{ID: userID, Role: models.UserRoleViewer}

	mockStore.On("GetUser", userID).Return(viewer, nil).Once()
	mockStore.On("CountUsersByRole").Return(0, 0, 1, nil).Once()
	mockStore.On("UpdateUser", viewer).Return(nil).Once()

	app.Post("/api/github/token", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return h.SaveToken(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/github/token", strings.NewReader(`{"token":"ghp_test"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("SaveToken request failed: %v", err)
	}
	if resp.StatusCode == http.StatusForbidden {
		t.Fatalf("expected admin bootstrap to bypass 403, got %d", resp.StatusCode)
	}
	if viewer.Role != models.UserRoleAdmin {
		t.Fatalf("expected viewer to be promoted to admin, got %q", viewer.Role)
	}
}

func TestIsAllowedGitHubPath(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		allowed bool
	}{
		// Allowed paths
		{"allowlisted repo path", "/repos/kubestellar/console/releases", true},
		{"public repo path", "/repos/some-org/some-repo/issues", true},
		{"rate_limit exact", "/rate_limit", true},

		// Blocked paths
		{"repos root", "/repos/", false},
		{"invalid repo slug", "/repos/evil/../repo/issues", false},
		{"gists", "/gists", false},
		{"orgs", "/orgs/kubestellar", false},
		{"search", "/search/issues", false},
		{"user exact", "/user", false},
		{"notifications exact", "/notifications", false},
		{"empty", "/", false},
		{"admin", "/admin/users", false},
		{"events", "/events", false},
		{"emojis", "/emojis", false},
		{"users endpoint", "/users/someuser", false},
		{"graphql", "/graphql", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedGitHubPath(tt.path)
			if got != tt.allowed {
				t.Errorf("isAllowedGitHubPath(%q) = %v, want %v", tt.path, got, tt.allowed)
			}
		})
	}
}

func TestShouldUseServerGitHubToken(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		allowed bool
	}{
		{"allowlisted repo uses server token", "/repos/kubestellar/console/releases", true},
		{"public repo does not use server token", "/repos/some-org/some-repo/issues", false},
		{"rate_limit uses server token", "/rate_limit", true},
		{"invalid repo path does not use server token", "/repos/evil/../repo/issues", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldUseServerGitHubToken(tt.path)
			if got != tt.allowed {
				t.Errorf("shouldUseServerGitHubToken(%q) = %v, want %v", tt.path, got, tt.allowed)
			}
		})
	}
}

func TestGitHubProxy_BlocksPathTraversalBeforeUpstream(t *testing.T) {
	setupGitHubProxyTestSettings(t)

	app := fiber.New()
	h := NewGitHubProxyHandler("server-token", nil)

	upstreamCalled := false
	originalClient := githubProxyClient
	githubProxyClient = &http.Client{Transport: RoundTripFunc(func(_ *http.Request) *http.Response {
		upstreamCalled = true
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
			Header:     make(http.Header),
		}
	})}
	defer func() { githubProxyClient = originalClient }()

	app.Get("/api/github/*", func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return h.Proxy(c)
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/github/repos/evil/../private/issues", nil))
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.False(t, upstreamCalled, "path traversal must be rejected before any upstream request")
}

func TestGitHubProxy_UsesServerTokenOnlyForAllowlistedRepos(t *testing.T) {
	const serverToken = "server-token"

	tests := []struct {
		name         string
		path         string
		expectAuth   string
		expectStatus int
	}{
		{
			name:         "allowlisted repo gets server token",
			path:         "/api/github/repos/kubestellar/console/releases",
			expectAuth:   "Bearer " + serverToken,
			expectStatus: http.StatusOK,
		},
		{
			name:         "public repo stays unauthenticated",
			path:         "/api/github/repos/some-org/some-repo/issues",
			expectAuth:   "",
			expectStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			setupGitHubProxyTestSettings(t)

			app := fiber.New()
			h := NewGitHubProxyHandler(serverToken, nil)

			originalClient := githubProxyClient
			githubProxyClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Equal(t, tc.expectAuth, req.Header.Get("Authorization"))
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
					Header:     make(http.Header),
				}
			})}
			defer func() { githubProxyClient = originalClient }()

			app.Get("/api/github/*", func(c *fiber.Ctx) error {
				c.Locals("userID", uuid.New())
				return h.Proxy(c)
			})

			resp, err := app.Test(httptest.NewRequest(http.MethodGet, tc.path, nil))
			require.NoError(t, err)
			assert.Equal(t, tc.expectStatus, resp.StatusCode)
		})
	}
}
