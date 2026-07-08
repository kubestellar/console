package rewards

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/rewards"
)

// ────────────────────────────────────────────────────────────────────────────
// extractRepo — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestExtractRepo_FullURL(t *testing.T) {
	result := extractRepo("https://api.github.com/repos/kubestellar/console")
	assert.Equal(t, "kubestellar/console", result)
}

func TestExtractRepo_DifferentOrg(t *testing.T) {
	result := extractRepo("https://api.github.com/repos/kubernetes/kubernetes")
	assert.Equal(t, "kubernetes/kubernetes", result)
}

func TestExtractRepo_ShortURL(t *testing.T) {
	// URL shorter than prefix — returns as-is
	result := extractRepo("https://api.github.com/repos/")
	assert.Equal(t, "https://api.github.com/repos/", result)
}

func TestExtractRepo_EmptyString(t *testing.T) {
	result := extractRepo("")
	assert.Equal(t, "", result)
}

// ────────────────────────────────────────────────────────────────────────────
// classifyIssue — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestClassifyIssue_BugLabel(t *testing.T) {
	item := searchItem{
		Title:     "Fix crash on startup",
		HTMLURL:   "https://github.com/kubestellar/console/issues/1",
		Number:    1,
		CreatedAt: "2025-01-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "bug"}},
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyIssue(item)
	assert.Equal(t, "issue_bug", result.Type)
	assert.Equal(t, rewards.PointsBugIssue, result.Points)
	assert.Equal(t, "kubestellar/console", result.Repo)
}

func TestClassifyIssue_FeatureLabel(t *testing.T) {
	item := searchItem{
		Title:     "Add dark mode",
		HTMLURL:   "https://github.com/kubestellar/console/issues/2",
		Number:    2,
		CreatedAt: "2025-01-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "enhancement"}},
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyIssue(item)
	assert.Equal(t, "issue_feature", result.Type)
	assert.Equal(t, rewards.PointsFeatureIssue, result.Points)
}

func TestClassifyIssue_KindBugLabel(t *testing.T) {
	item := searchItem{
		Title:     "Crash",
		CreatedAt: "2025-01-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "kind/bug"}},
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyIssue(item)
	assert.Equal(t, "issue_bug", result.Type)
}

func TestClassifyIssue_NoMatchingLabels(t *testing.T) {
	item := searchItem{
		Title:     "Question about setup",
		CreatedAt: "2025-01-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "question"}, {Name: "help wanted"}},
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyIssue(item)
	assert.Equal(t, "issue_other", result.Type)
	assert.Equal(t, rewards.PointsOtherIssue, result.Points)
}

func TestClassifyIssue_EmptyLabels(t *testing.T) {
	item := searchItem{
		Title:     "Generic issue",
		CreatedAt: "2025-01-01T00:00:00Z",
		Labels:    nil,
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyIssue(item)
	assert.Equal(t, "issue_other", result.Type)
}

// ────────────────────────────────────────────────────────────────────────────
// classifyPR — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestClassifyPR_OpenedOnly(t *testing.T) {
	item := searchItem{
		Title:     "Fix typo",
		HTMLURL:   "https://github.com/kubestellar/console/pull/10",
		Number:    10,
		CreatedAt: "2025-02-01T00:00:00Z",
		RepoURL:   "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyPR(item)
	require.Len(t, result, 1)
	assert.Equal(t, "pr_opened", result[0].Type)
	assert.Equal(t, rewards.PointsPROpened, result[0].Points)
}

func TestClassifyPR_Merged(t *testing.T) {
	mergedAt := "2025-02-05T10:00:00Z"
	item := searchItem{
		Title:       "Add feature",
		HTMLURL:     "https://github.com/kubestellar/console/pull/20",
		Number:      20,
		CreatedAt:   "2025-02-01T00:00:00Z",
		PullRequest: &searchPRRef{MergedAt: &mergedAt},
		RepoURL:     "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyPR(item)
	require.Len(t, result, 2)
	assert.Equal(t, "pr_opened", result[0].Type)
	assert.Equal(t, rewards.PointsPROpened, result[0].Points)
	assert.Equal(t, "pr_merged", result[1].Type)
	assert.Equal(t, rewards.PointsPRMerged, result[1].Points)
	assert.Equal(t, mergedAt, result[1].CreatedAt)
}

func TestClassifyPR_NotMerged(t *testing.T) {
	item := searchItem{
		Title:       "WIP: something",
		HTMLURL:     "https://github.com/kubestellar/console/pull/30",
		Number:      30,
		CreatedAt:   "2025-02-01T00:00:00Z",
		PullRequest: &searchPRRef{MergedAt: nil},
		RepoURL:     "https://api.github.com/repos/kubestellar/console",
	}
	result := classifyPR(item)
	require.Len(t, result, 1)
	assert.Equal(t, "pr_opened", result[0].Type)
}

// ────────────────────────────────────────────────────────────────────────────
// requiresAppAttribution — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestRequiresAppAttribution_NoCutoffEnv(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "")
	assert.False(t, requiresAppAttribution("2025-06-01T00:00:00Z"))
}

func TestRequiresAppAttribution_BeforeCutoff(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2025-06-01T00:00:00Z")
	assert.False(t, requiresAppAttribution("2025-05-15T00:00:00Z"))
}

func TestRequiresAppAttribution_AfterCutoff(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2025-06-01T00:00:00Z")
	assert.True(t, requiresAppAttribution("2025-06-15T00:00:00Z"))
}

func TestRequiresAppAttribution_InvalidCutoff(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "not-a-date")
	assert.False(t, requiresAppAttribution("2025-06-15T00:00:00Z"))
}

func TestRequiresAppAttribution_InvalidCreatedAt(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2025-06-01T00:00:00Z")
	assert.False(t, requiresAppAttribution("bad-timestamp"))
}

// ────────────────────────────────────────────────────────────────────────────
// isConsoleAppSubmitted — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestIsConsoleAppSubmitted_NilApp(t *testing.T) {
	item := searchItem{PerformedViaGitHubApp: nil}
	assert.False(t, isConsoleAppSubmitted(item))
}

func TestIsConsoleAppSubmitted_CorrectSlug(t *testing.T) {
	item := searchItem{
		PerformedViaGitHubApp: &searchApp{Slug: "kubestellar-console-bot"},
	}
	assert.True(t, isConsoleAppSubmitted(item))
}

func TestIsConsoleAppSubmitted_WrongSlug(t *testing.T) {
	item := searchItem{
		PerformedViaGitHubApp: &searchApp{Slug: "some-other-bot"},
	}
	assert.False(t, isConsoleAppSubmitted(item))
}
