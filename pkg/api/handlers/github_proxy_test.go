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
)

func setupGitHubProxyTestSettings(t *testing.T) {
	t.Helper()

	manager := settings.GetSettingsManager()
	settingsDir := t.TempDir()
	manager.SetSettingsPath(filepath.Join(settingsDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(settingsDir, ".keyfile"))
	if err := manager.Load(); err != nil {
		t.Fatalf("load settings: %v", err)
	}

	all, err := manager.GetAll()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	all.FeedbackGitHubToken = ""
	all.FeedbackGitHubTokenSource = ""
	if err := manager.SaveAll(all); err != nil {
		t.Fatalf("save settings: %v", err)
	}
}

func TestSaveToken_RejectsNonAdmin(t *testing.T) {
	setupGitHubProxyTestSettings(t)

	app := fiber.New()
	mockStore := new(test.MockStore)
	h := NewGitHubProxyHandler("", mockStore)
	userID := uuid.New()
	viewer := &models.User{ID: userID, Role: models.UserRoleViewer}

	mockStore.On("GetUser", userID).Return(viewer, nil).Once()

	app.Post("/api/github/token", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		if err := RequireAdmin(c, mockStore); err != nil {
			return err
		}
		return h.SaveToken(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/github/token", strings.NewReader(`{"token":"ghp_test"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("SaveToken request failed: %v", err)
	}
	// Fix for CWE-269 (#16653): viewers must NOT be auto-promoted to admin
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for non-admin user, got %d", resp.StatusCode)
	}
	if viewer.Role != models.UserRoleViewer {
		t.Fatalf("expected viewer role to remain unchanged, got %q", viewer.Role)
	}
}

func TestSaveToken_AllowsAdmin(t *testing.T) {
	setupGitHubProxyTestSettings(t)

	app := fiber.New()
	mockStore := new(test.MockStore)
	h := NewGitHubProxyHandler("", mockStore)
	userID := uuid.New()
	admin := &models.User{ID: userID, Role: models.UserRoleAdmin}

	mockStore.On("GetUser", userID).Return(admin, nil).Once()

	app.Post("/api/github/token", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		if err := RequireAdmin(c, mockStore); err != nil {
			return err
		}
		return h.SaveToken(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/github/token", strings.NewReader(`{"token":"ghp_test"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("SaveToken request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for admin save attempt, got %d", resp.StatusCode)
	}

	all, err := settings.GetSettingsManager().GetAll()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if all.FeedbackGitHubToken != "ghp_test" {
		t.Fatalf("expected saved token, got %q", all.FeedbackGitHubToken)
	}
	if all.FeedbackGitHubTokenSource != settings.GitHubTokenSourceSettings {
		t.Fatalf("expected token source %q, got %q", settings.GitHubTokenSourceSettings, all.FeedbackGitHubTokenSource)
	}
}

func TestGetGitHubProxyAllowedRepos_Defaults(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	t.Setenv("GITHUB_PROXY_REPOS", "")

	allowed := getGitHubProxyAllowedRepos()
	expected := []string{
		"kubestellar/kubestellar",
		"kubestellar/console",
		"kubestellar/docs",
		"kubestellar/ocm-transport-plugin",
		"kubestellar/galaxy",
		"kubestellar/ui",
	}
	if len(allowed) != len(expected) {
		t.Fatalf("expected %d default repos, got %d", len(expected), len(allowed))
	}
	for _, repo := range expected {
		if _, ok := allowed[repo]; !ok {
			t.Fatalf("expected default repo %q in allowlist", repo)
		}
	}
}

func TestGetGitHubProxyAllowedRepos_FromEnv(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	t.Setenv("GITHUB_PROXY_REPOS", "Example/One, invalid slug , two/Repo")

	allowed := getGitHubProxyAllowedRepos()
	if len(allowed) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(allowed))
	}
	for _, repo := range []string{"example/one", "two/repo"} {
		if _, ok := allowed[repo]; !ok {
			t.Fatalf("expected repo %q in allowlist", repo)
		}
	}
}

func TestGitHubProxyExtractRepo(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	tests := []struct {
		name string
		path string
		repo string
		ok   bool
	}{
		{"valid repo path", "/repos/KubeStellar/Console/releases", "kubestellar/console", true},
		{"missing repo", "/repos/kubestellar", "", false},
		{"wrong prefix", "/search/issues", "", false},
		{"invalid repo slug", "/repos/kubestellar/console%2Fbad/issues", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo, ok := githubProxyExtractRepo(tt.path)
			if repo != tt.repo || ok != tt.ok {
				t.Fatalf("githubProxyExtractRepo(%q) = (%q, %v), want (%q, %v)", tt.path, repo, ok, tt.repo, tt.ok)
			}
		})
	}
}

func TestGitHubProxyScopeSearchQuery(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	allowedRepos := map[string]struct{}{
		"kubestellar/console": {},
		"kubestellar/docs":    {},
	}

	scoped := githubProxyScopeSearchQuery("is:pr author:octocat", allowedRepos)
	if !strings.Contains(scoped, "(is:pr author:octocat)") {
		t.Fatalf("expected original query to be preserved, got %q", scoped)
	}
	if !strings.Contains(scoped, "repo:kubestellar/console") || !strings.Contains(scoped, "repo:kubestellar/docs") {
		t.Fatalf("expected allowlisted repo qualifiers in %q", scoped)
	}
	if !strings.Contains(scoped, " OR ") {
		t.Fatalf("expected OR between repo qualifiers in %q", scoped)
	}
}

func TestIsAllowedGitHubPath(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	mockStore := new(test.MockStore)
	h := NewGitHubProxyHandler("", mockStore)
	h.allowedRepos = map[string]struct{}{
		"kubestellar/console": {},
		"external/allowed":    {},
	}

	tests := []struct {
		name    string
		path    string
		allowed bool
	}{
		{"allowed default repo", "/repos/kubestellar/console/releases", true},
		{"allowed configured repo", "/repos/external/allowed/issues", true},
		{"missing repo slug", "/repos/", false},
		{"blocked external repo", "/repos/evil/private/issues", false},
		{"rate limit", "/rate_limit", true},
		{"search", "/search/issues", true},
		{"user exact", "/user", true},
		{"user subpath", "/user/repos", true},
		{"notifications", "/notifications", true},
		{"gists", "/gists", false},
		{"graphql", "/graphql", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := h.isAllowedGitHubPath(tt.path)
			if got != tt.allowed {
				t.Errorf("isAllowedGitHubPath(%q) = %v, want %v", tt.path, got, tt.allowed)
			}
		})
	}
}

func TestProxy_BlocksDisallowedRepoRequest(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	app := fiber.New()
	h := NewGitHubProxyHandler("", nil)
	h.allowedRepos = map[string]struct{}{"kubestellar/console": {}}

	called := false
	originalClient := githubProxyClient
	githubProxyClient = &http.Client{Transport: RoundTripFunc(func(_ *http.Request) *http.Response {
		called = true
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}
	})}
	defer func() { githubProxyClient = originalClient }()

	app.Get("/api/github/*", func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return h.Proxy(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/github/repos/private/repo/issues", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for disallowed repo, got %d", resp.StatusCode)
	}
	if called {
		t.Fatal("expected disallowed repo request to be blocked before reaching GitHub")
	}
}

func TestProxy_ScopesSearchRequestsToAllowedRepos(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	app := fiber.New()
	h := NewGitHubProxyHandler("", nil)
	h.allowedRepos = map[string]struct{}{
		"kubestellar/console": {},
		"kubestellar/docs":    {},
	}

	var capturedQuery string
	originalClient := githubProxyClient
	githubProxyClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		capturedQuery = req.URL.Query().Get("q")
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"ok":true}`)), Header: make(http.Header)}
	})}
	defer func() { githubProxyClient = originalClient }()

	app.Get("/api/github/*", func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return h.Proxy(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/github/search/issues?q=is%3Apr+author%3Aoctocat", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for scoped search, got %d", resp.StatusCode)
	}
	if !strings.Contains(capturedQuery, "(is:pr author:octocat)") {
		t.Fatalf("expected original search query to be preserved, got %q", capturedQuery)
	}
	if !strings.Contains(capturedQuery, "repo:kubestellar/console") || !strings.Contains(capturedQuery, "repo:kubestellar/docs") {
		t.Fatalf("expected captured query to include allowlisted repos, got %q", capturedQuery)
	}
}

func TestProxy_AllowsAllowlistedRepoRequest(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	app := fiber.New()
	h := NewGitHubProxyHandler("test-token", nil)
	h.allowedRepos = map[string]struct{}{"kubestellar/console": {}}

	originalClient := githubProxyClient
	githubProxyClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		if req.URL.Path != "/repos/kubestellar/console/releases" {
			t.Fatalf("upstream path = %q, want %q", req.URL.Path, "/repos/kubestellar/console/releases")
		}
		if got := req.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("Authorization header = %q, want %q", got, "Bearer test-token")
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"ok":true}`)), Header: make(http.Header)}
	})}
	defer func() { githubProxyClient = originalClient }()

	app.Get("/api/github/*", func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return h.Proxy(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/github/repos/kubestellar/console/releases", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for allowlisted repo, got %d", resp.StatusCode)
	}
}
