package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func TestSaveToken_BootstrapsFirstAdmin(t *testing.T) {
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
