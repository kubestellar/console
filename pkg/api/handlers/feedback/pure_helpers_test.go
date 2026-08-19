package feedback

import (
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// TestResolveGitHubUIBase covers the pure environment-driven branches of
// resolveGitHubUIBase (config.go): empty GITHUB_URL, github.com aliases,
// bare-host input, GHE URLs with and without /api/v3 suffix, and trailing
// slashes. This is the web-UI base used to construct issue/commit permalinks.
func TestResolveGitHubUIBase(t *testing.T) {
	prev, hadPrev := os.LookupEnv("GITHUB_URL")
	t.Cleanup(func() {
		if hadPrev {
			_ = os.Setenv("GITHUB_URL", prev)
		} else {
			_ = os.Unsetenv("GITHUB_URL")
		}
	})

	tests := []struct {
		name string
		env  string
		want string
	}{
		{"empty defaults to github.com", "", "https://github.com"},
		{"whitespace-only defaults to github.com", "   ", "https://github.com"},
		{"github.com bare host", "github.com", "https://github.com"},
		{"github.com full URL", "https://github.com/foo", "https://github.com"},
		{"api.github.com collapses to github.com", "https://api.github.com/", "https://github.com"},
		{"www.github.com collapses to github.com", "https://www.github.com", "https://github.com"},
		{"GHE plain URL", "https://ghe.example.com", "https://ghe.example.com"},
		{"GHE URL with trailing slash", "https://ghe.example.com/", "https://ghe.example.com"},
		{"GHE URL with /api/v3 suffix stripped", "https://ghe.example.com/api/v3", "https://ghe.example.com"},
		{"GHE URL with /api/v3/ trailing slash stripped", "https://ghe.example.com/api/v3/", "https://ghe.example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_ = os.Setenv("GITHUB_URL", tt.env)
			got := resolveGitHubUIBase()
			if got != tt.want {
				t.Errorf("resolveGitHubUIBase() with GITHUB_URL=%q = %q, want %q", tt.env, got, tt.want)
			}
		})
	}
}

// TestFeatureRequestsToQueueItems covers the GitHub-down fallback path
// (requests_list.go:featureRequestsToQueueItems) that maps stored
// FeatureRequest rows into QueueItem wire shapes when GitHub is unreachable.
func TestFeatureRequestsToQueueItems_EmptyReturnsEmptySlice(t *testing.T) {
	h := &FeedbackHandler{repoOwner: "kubestellar", repoName: "console"}
	got := h.featureRequestsToQueueItems(nil)
	if got == nil {
		t.Fatal("expected non-nil (empty) slice, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice, got %d items", len(got))
	}
}

func TestFeatureRequestsToQueueItems_ConsoleRepoWithIssueAndPR(t *testing.T) {
	h := &FeedbackHandler{repoOwner: "kubestellar", repoName: "console"}
	created := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	updated := created.Add(2 * time.Hour)
	issueNum := 4242
	prNum := 99

	id := uuid.New()
	userID := uuid.New()
	got := h.featureRequestsToQueueItems([]models.FeatureRequest{{
		ID:                id,
		UserID:            userID,
		Title:             "example",
		Description:       "desc",
		RequestType:       "bug",
		TargetRepo:        models.TargetRepoConsole,
		GitHubIssueNumber: &issueNum,
		Status:            "open",
		PRNumber:          &prNum,
		PRURL:             "https://github.com/kubestellar/console/pull/99",
		CopilotSessionURL: "https://copilot.example/session/abc",
		NetlifyPreviewURL: "https://deploy-preview-99--example.netlify.app",
		LatestComment:     "hello",
		ClosedByUser:      true,
		CreatedAt:         created,
		UpdatedAt:         &updated,
	}})

	if len(got) != 1 {
		t.Fatalf("expected 1 item, got %d", len(got))
	}
	item := got[0]
	if item.ID != id.String() || item.UserID != userID.String() {
		t.Errorf("ID/UserID mismatch: %+v", item)
	}
	if item.GitHubIssueNumber != issueNum {
		t.Errorf("issue number mismatch: got %d, want %d", item.GitHubIssueNumber, issueNum)
	}
	wantIssueURL := "https://github.com/kubestellar/console/issues/4242"
	if item.GitHubIssueURL != wantIssueURL {
		t.Errorf("issue URL mismatch: got %q, want %q", item.GitHubIssueURL, wantIssueURL)
	}
	if item.PRNumber != prNum {
		t.Errorf("PR number mismatch: got %d, want %d", item.PRNumber, prNum)
	}
	if !item.ClosedByUser {
		t.Errorf("ClosedByUser should propagate")
	}
	if item.CreatedAt != "2026-06-01T12:00:00Z" {
		t.Errorf("CreatedAt = %q", item.CreatedAt)
	}
	if item.UpdatedAt != "2026-06-01T14:00:00Z" {
		t.Errorf("UpdatedAt = %q", item.UpdatedAt)
	}
	// GitHubLogin is left blank on this fallback path (not persisted locally).
	if item.GitHubLogin != "" {
		t.Errorf("GitHubLogin should be empty on fallback path, got %q", item.GitHubLogin)
	}
}

func TestFeatureRequestsToQueueItems_DocsRepoUsesDocsRepoName(t *testing.T) {
	h := &FeedbackHandler{repoOwner: "kubestellar", repoName: "console"}
	created := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	issueNum := 7
	got := h.featureRequestsToQueueItems([]models.FeatureRequest{{
		ID:                uuid.New(),
		UserID:            uuid.New(),
		Title:             "docs bug",
		TargetRepo:        models.TargetRepoDocs,
		RequestType:       "bug",
		Status:            "open",
		GitHubIssueNumber: &issueNum,
		CreatedAt:         created,
	}})

	if len(got) != 1 {
		t.Fatalf("expected 1 item, got %d", len(got))
	}
	want := "https://github.com/kubestellar/docs/issues/7"
	if got[0].GitHubIssueURL != want {
		t.Errorf("docs issue URL = %q, want %q", got[0].GitHubIssueURL, want)
	}
	if got[0].TargetRepo != string(models.TargetRepoDocs) {
		t.Errorf("TargetRepo string = %q, want %q", got[0].TargetRepo, models.TargetRepoDocs)
	}
}

func TestFeatureRequestsToQueueItems_MissingIssueLeavesURLBlank(t *testing.T) {
	h := &FeedbackHandler{repoOwner: "kubestellar", repoName: "console"}
	created := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	got := h.featureRequestsToQueueItems([]models.FeatureRequest{{
		ID:          uuid.New(),
		UserID:      uuid.New(),
		TargetRepo:  models.TargetRepoConsole,
		RequestType: "bug",
		Status:      "open",
		// GitHubIssueNumber nil, PRNumber nil, UpdatedAt nil
		CreatedAt: created,
	}})
	if len(got) != 1 {
		t.Fatalf("expected 1 item, got %d", len(got))
	}
	if got[0].GitHubIssueNumber != 0 || got[0].GitHubIssueURL != "" {
		t.Errorf("expected zero issue fields, got %+v", got[0])
	}
	if got[0].PRNumber != 0 {
		t.Errorf("expected zero PRNumber, got %d", got[0].PRNumber)
	}
	if got[0].UpdatedAt != "" {
		t.Errorf("expected empty UpdatedAt, got %q", got[0].UpdatedAt)
	}
}

func TestFeatureRequestsToQueueItems_EmptyRepoOwnerSuppressesIssueURL(t *testing.T) {
	// Guard against the historical #9896 bug: without a configured repo owner
	// the fallback path should NOT construct a broken URL like
	// "https://github.com//console/issues/N".
	h := &FeedbackHandler{repoOwner: "", repoName: "console"}
	created := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	issueNum := 1
	got := h.featureRequestsToQueueItems([]models.FeatureRequest{{
		ID: uuid.New(), UserID: uuid.New(),
		TargetRepo:        models.TargetRepoConsole,
		RequestType:       "bug",
		Status:            "open",
		GitHubIssueNumber: &issueNum,
		CreatedAt:         created,
	}})
	if got[0].GitHubIssueURL != "" {
		t.Errorf("expected empty issue URL when repoOwner unset, got %q", got[0].GitHubIssueURL)
	}
	if got[0].GitHubIssueNumber != 1 {
		t.Errorf("issue number should still be populated: %d", got[0].GitHubIssueNumber)
	}
}
