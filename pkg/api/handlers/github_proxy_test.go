package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func TestSaveToken_BootstrapsFirstAdmin(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	h := NewGitHubProxyHandler("", mockStore, nil)
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

func TestGetGitHubProxyAllowedRepos(t *testing.T) {
	oldEnv := os.Getenv("GITHUB_PROXY_ALLOWED_REPOS")
	t.Cleanup(func() {
		if oldEnv == "" {
			os.Unsetenv("GITHUB_PROXY_ALLOWED_REPOS")
			return
		}
		os.Setenv("GITHUB_PROXY_ALLOWED_REPOS", oldEnv)
	})

	os.Setenv("GITHUB_PROXY_ALLOWED_REPOS", "custom/repo, invalid repo , another/repo")
	got := getGitHubProxyAllowedRepos()
	want := []string{"custom/repo", "another/repo"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("getGitHubProxyAllowedRepos() = %v, want %v", got, want)
	}
}

func TestExtractGitHubRepoSlug(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
		ok   bool
	}{
		{name: "repo root", path: "/repos/kubestellar/console", want: "kubestellar/console", ok: true},
		{name: "repo subpath", path: "/repos/kubestellar/console/releases", want: "kubestellar/console", ok: true},
		{name: "missing repo", path: "/repos/kubestellar", ok: false},
		{name: "wrong prefix", path: "/search/issues", ok: false},
		{name: "invalid slug", path: "/repos/evil/../repo", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := extractGitHubRepoSlug(tt.path)
			if ok != tt.ok || got != tt.want {
				t.Fatalf("extractGitHubRepoSlug(%q) = (%q, %v), want (%q, %v)", tt.path, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestGitHubProxyRejectsRepoOutsideAllowlist(t *testing.T) {
	app := fiber.New()
	h := NewGitHubProxyHandler("", nil, []string{"kubestellar/console"})
	app.Get("/api/github/*", h.Proxy)

	called := 0
	origTransport := client.GitHub.Transport
	client.GitHub.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
		called++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
		}
	})
	t.Cleanup(func() { client.GitHub.Transport = origTransport })

	req := httptest.NewRequest(http.MethodGet, "/api/github/repos/evil/private/releases", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Proxy request failed: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
	if called != 0 {
		t.Fatalf("expected proxy to reject before outbound request, got %d calls", called)
	}
}

func TestGitHubProxyAllowsRepoInAllowlist(t *testing.T) {
	app := fiber.New()
	h := NewGitHubProxyHandler("", nil, []string{"kubestellar/console"})
	app.Get("/api/github/*", h.Proxy)

	called := 0
	origTransport := client.GitHub.Transport
	client.GitHub.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
		called++
		if req.URL.Path != "/repos/kubestellar/console/releases" {
			t.Fatalf("unexpected upstream path %q", req.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
		}
	})
	t.Cleanup(func() { client.GitHub.Transport = origTransport })

	req := httptest.NewRequest(http.MethodGet, "/api/github/repos/kubestellar/console/releases", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Proxy request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if called != 1 {
		t.Fatalf("expected 1 upstream request, got %d", called)
	}
}
