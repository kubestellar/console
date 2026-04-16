package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

func newGHPTestApp(t *testing.T, token, mutationToken string) *fiber.App {
	t.Helper()
	t.Setenv("GITHUB_MUTATIONS_TOKEN", mutationToken)
	h := NewGitHubPipelinesHandler(token)
	app := fiber.New()
	app.Get("/api/github-pipelines", h.Serve)
	app.Post("/api/github-pipelines", h.Serve)
	return app
}

func TestGitHubPipelines_MissingTokenReturns500(t *testing.T) {
	app := newGHPTestApp(t, "", "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=pulse", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 500 {
		t.Fatalf("expected 500 when GITHUB_TOKEN is empty, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_UnknownViewReturns400(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=bogus", nil)
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
	app := newGHPTestApp(t, "fake-token", "")
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 503 {
		t.Fatalf("expected 503 when mutations disabled, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsUnknownRepo(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token")
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=rerun&repo=evil/repo&run=1", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 for disallowed repo, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsUnknownOp(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token")
	req := httptest.NewRequest("POST", "/api/github-pipelines?view=mutate&op=delete&repo=kubestellar/console&run=1", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 for unknown op, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_MutateRejectsGET(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "fake-mutation-token")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=mutate&op=rerun&repo=kubestellar/console&run=1", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 405 {
		t.Fatalf("expected 405 for GET mutate, got %d", res.StatusCode)
	}
}

func TestGitHubPipelines_LogRequiresParams(t *testing.T) {
	app := newGHPTestApp(t, "fake-token", "")
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=log", nil)
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 when repo/job missing, got %d", res.StatusCode)
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
	ancient := time.Now().AddDate(0, 0, -(ghpHistoryRetentionDays + 10)).Format("2006-01-02") + "T00:00:00Z"
	h.merge([]ghpWorkflowRun{
		{ID: 99, Repo: "kubestellar/console", Name: "Release", Conclusion: &success, CreatedAt: ancient, HTMLURL: "old"},
	})
	snap = h.snapshot()
	if _, had := snap["kubestellar/console"]["Release"][ancient[:10]]; had {
		t.Fatalf("expected ancient day to be trimmed")
	}
}

func TestGHPIsAllowedRepo(t *testing.T) {
	if !ghpIsAllowedRepo("kubestellar/console") {
		t.Fatal("console should be allowed")
	}
	if ghpIsAllowedRepo("evil/repo") {
		t.Fatal("non-allowlist repo must be rejected")
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
