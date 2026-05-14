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
		{"repos prefix", "/repos/kubestellar/console/releases", true},
		{"repos root", "/repos/", true},
		{"rate_limit exact", "/rate_limit", true},
		{"user exact", "/user", true},
		{"user subpath", "/user/repos", true},
		{"notifications exact", "/notifications", true},
		{"notifications subpath", "/notifications/threads/123", true},

		// Blocked paths
		{"gists", "/gists", false},
		{"orgs", "/orgs/kubestellar", false},
		{"search", "/search/issues", true},
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
