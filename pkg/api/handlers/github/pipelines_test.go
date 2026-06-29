package github

import (
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func newGHPTestApp(t *testing.T, token, mutationToken string, store *test.MockStore, userRole models.UserRole) *fiber.App {
	t.Helper()
	t.Setenv("GITHUB_MUTATIONS_TOKEN", mutationToken)
	h := NewGitHubPipelinesHandler(token, store)
	app := fiber.New()
	if store != nil {
		userID := uuid.New()
		store.On("GetUser", userID).Return(&models.User{ID: userID, Role: userRole}, nil).Maybe()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
	}
	app.Get("/api/github-pipelines", h.Serve)
	app.Post("/api/github-pipelines", h.Serve)
	return app
}

func TestGitHubPipelines_MissingTokenReturns500(t *testing.T) {
	app := newGHPTestApp(t, "", "", nil, "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=pulse", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 500 {
		t.Fatalf("expected 500 when GITHUB_TOKEN is empty, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_UnknownViewReturns400(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "", nil, "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=bogus", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 for unknown view, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateDisabledWhenNoMutationToken(t *testing.T) {
	// Intentional: local/in-cluster deploys are read-only by default.
	// Mutations only enable when GITHUB_MUTATIONS_TOKEN is set.
	mockStore := new(test.MockStore)
	app := newGHPTestApp(t, "fake-token", "", mockStore, models.UserRoleAdmin)
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 503 {
		t.Fatalf("expected 503 when mutations disabled, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsUnknownRepo(t *testing.T) {
	mockStore := new(test.MockStore)
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token", mockStore, models.UserRoleAdmin)
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=some-org/some-repo&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 403 {
		t.Fatalf("expected 403 for disallowed repo, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsUnknownOp(t *testing.T) {
	mockStore := new(test.MockStore)
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token", mockStore, models.UserRoleAdmin)
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=delete&repo=kubestellar/console&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 for unknown op, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsGET(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token", nil, "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 405 {
		t.Fatalf("expected 405 for GET mutate, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_LogRequiresParams(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "", nil, "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=log", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 when repo/job missing, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_ReadRejectsNonAllowlistedRepo(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "", nil, "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=pulse&repo=some-org/some-repo", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 403 {
		t.Fatalf("expected 403 for non-allowlisted repo, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRequiresAuthenticatedUser(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token", nil, "")
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 401 {
		t.Fatalf("expected 401 for anonymous mutation request, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRequiresAdmin(t *testing.T) {
	mockStore := new(test.MockStore)
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token", mockStore, models.UserRoleViewer)
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 403 {
		t.Fatalf("expected 403 for non-admin mutation request, got %d", res.StatusCode)
	}
}

func TestGHPHistory_MergeAndTrim(t *testing.T) {
	h := newGHPHistory()
	success := "success"
	failure := "failure"
	// Two runs on the same day — newer ID wins
	h.merge([]ghpWorkflowRun{
		{ID: 1, Repo: "kubestellar/console", Name: "Release", Conclusion: &failure, CreatedAt: "2026-04-01T05:00:00Z", HTMLURL: "url-1"},
		{ID: 2, Repo: "kubestellar/console", Name: "Release", Conclusion: &success, CreatedAt: "2026-04-01T06:00:00Z", HTMLURL: "url-2"},
	})
	snap := h.snapshot()
	day := snap["kubestellar/console"]["Release"]["2026-04-01"]
	if day.RunID != 2 {
		t.Fatalf("expected newer run ID to win, got %d", day.RunID)
	}
	if day.Conclusion == nil || *day.Conclusion != "success" {
		t.Fatalf("expected success conclusion, got %v", day.Conclusion)
	}
	// Trim retention: insert an ancient day and verify it's dropped
	ancient := time.Now().AddDate(0, 0, -(ghpHistoryRetentionDays+10)).Format("2006-01-02") + "T00:00:00Z"
	h.merge([]ghpWorkflowRun{
		{ID: 99, Repo: "kubestellar/console", Name: "Release", Conclusion: &success, CreatedAt: ancient, HTMLURL: "old"},
	})
	snap = h.snapshot()
	if _, had := snap["kubestellar/console"]["Release"][ancient[:10]]; had {
		t.Fatalf("expected ancient day to be trimmed")
	}
}

func TestGHPIsAllowedRepo(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", "kubestellar/console,kubestellar/docs")
	if !ghpIsAllowedRepo("kubestellar/console") {
		t.Fatal("console should be allowed")
	}
	if ghpIsAllowedRepo("some-org/some-repo") {
		t.Fatal("non-allowlisted repo should be rejected")
	}
	if !ghpIsAllowedRepo("KUBESTELLAR/CONSOLE") {
		t.Fatal("allowlist check should be case-insensitive")
	}
	for _, bad := range []string{
		"",
		"noslash",
		"owner/repo/extra",
		"../etc/passwd",
		"owner/../repo",
		"owner/repo%00evil",
		"/leading-slash",
		"trailing-slash/",
	} {
		if ghpIsAllowedRepo(bad) {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}

func TestGHPStreakKind(t *testing.T) {
	s := "success"
	f := "failure"
	to := "timed_out"
	c := "cancelled"
	for _, tc := range []struct {
		in   *string
		want string
	}{
		{nil, ""},
		{&s, "success"},
		{&f, "failure"},
		{&to, "failure"},
		{&c, ""},
	} {
		if got := ghpStreakKind(tc.in); got != tc.want {
			inStr := "<nil>"
			if tc.in != nil {
				inStr = *tc.in
			}
			t.Errorf("ghpStreakKind(%s) = %q, want %q", inStr, got, tc.want)
		}
	}
}

func TestGHPDefaultRepos(t *testing.T) {
	want := []string{
		"kubestellar/kubestellar",
		"kubestellar/console",
		"kubestellar/docs",
		"kubestellar/ocm-transport-plugin",
		"kubestellar/galaxy",
		"kubestellar/ui",
	}
	if len(ghpDefaultRepos) != len(want) {
		t.Fatalf("expected %d default repos, got %d", len(want), len(ghpDefaultRepos))
	}
	for i, repo := range want {
		if ghpDefaultRepos[i] != repo {
			t.Fatalf("default repo %d = %q, want %q", i, ghpDefaultRepos[i], repo)
		}
	}
}

func TestGHPGetRepos(t *testing.T) {
	// Save and restore original env var
	oldEnv := os.Getenv("PIPELINE_REPOS")
	defer func() {
		if oldEnv == "" {
			os.Unsetenv("PIPELINE_REPOS")
		} else {
			os.Setenv("PIPELINE_REPOS", oldEnv)
		}
	}()

	tests := []struct {
		name     string
		env      string
		wantLen  int
		contains []string
	}{
		{
			name:     "empty env var returns defaults",
			env:      "",
			wantLen:  len(ghpDefaultRepos),
			contains: ghpDefaultRepos,
		},
		{
			name:     "valid repos are parsed",
			env:      "owner/repo1,owner/repo2",
			wantLen:  2,
			contains: []string{"owner/repo1", "owner/repo2"},
		},
		{
			name:     "mix of valid and invalid skips invalid",
			env:      "owner/repo1,../etc/passwd,owner/repo2",
			wantLen:  2,
			contains: []string{"owner/repo1", "owner/repo2"},
		},
		{
			name:     "all invalid returns defaults",
			env:      "../etc/passwd,noslash,owner/repo/extra",
			wantLen:  len(ghpDefaultRepos),
			contains: ghpDefaultRepos,
		},
		{
			name:     "empty after trimming invalid entries returns defaults",
			env:      " , ../etc/passwd , ",
			wantLen:  len(ghpDefaultRepos),
			contains: ghpDefaultRepos,
		},
		{
			name:     "whitespace only returns defaults",
			env:      "   ,  ,   ",
			wantLen:  len(ghpDefaultRepos),
			contains: ghpDefaultRepos,
		},
		{
			name:     "valid repos with extra whitespace are trimmed",
			env:      "  owner/repo1  ,  owner/repo2  ",
			wantLen:  2,
			contains: []string{"owner/repo1", "owner/repo2"},
		},
		{
			name:     "path traversal attempts are skipped",
			env:      "evil/../passwd,owner/../../repo,owner/repo",
			wantLen:  1,
			contains: []string{"owner/repo"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.env == "" {
				os.Unsetenv("PIPELINE_REPOS")
			} else {
				os.Setenv("PIPELINE_REPOS", tc.env)
			}
			got := ghpGetRepos()
			if len(got) != tc.wantLen {
				t.Errorf("ghpGetRepos() length = %d, want %d", len(got), tc.wantLen)
			}
			for _, want := range tc.contains {
				found := false
				for _, g := range got {
					if g == want {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("ghpGetRepos() does not contain %q, got %v", want, got)
				}
			}
		})
	}
}
