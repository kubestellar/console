package github

import (
	"os"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// ghpGetRepos — PIPELINE_REPOS env parsing
// ---------------------------------------------------------------------------

func TestGhpGetRepos_Default(t *testing.T) {
	os.Unsetenv("PIPELINE_REPOS")
	repos := ghpGetRepos()
	if len(repos) == 0 {
		t.Fatal("expected non-empty default repos")
	}
	// Should return ghpDefaultRepos
	if repos[0] != ghpDefaultRepos[0] {
		t.Errorf("expected first repo %q, got %q", ghpDefaultRepos[0], repos[0])
	}
}

func TestGhpGetRepos_Custom(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", "org1/repo1,org2/repo2")
	repos := ghpGetRepos()
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(repos))
	}
	if repos[0] != "org1/repo1" {
		t.Errorf("expected org1/repo1, got %q", repos[0])
	}
	if repos[1] != "org2/repo2" {
		t.Errorf("expected org2/repo2, got %q", repos[1])
	}
}

func TestGhpGetRepos_WhitespaceEntries(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", " org1/repo1 , org2/repo2 , ")
	repos := ghpGetRepos()
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos (whitespace trimmed), got %d: %v", len(repos), repos)
	}
}

func TestGhpGetRepos_EmptyEnv(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", "")
	repos := ghpGetRepos()
	if len(repos) != len(ghpDefaultRepos) {
		t.Errorf("expected default repos (%d), got %d", len(ghpDefaultRepos), len(repos))
	}
}

func TestGhpGetRepos_AllInvalid(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", "no-slash,also-bad,../../../etc")
	repos := ghpGetRepos()
	// All invalid → falls back to defaults
	if len(repos) != len(ghpDefaultRepos) {
		t.Errorf("expected default repos when all are invalid, got %d: %v", len(repos), repos)
	}
}

func TestGhpGetRepos_MixedValidInvalid(t *testing.T) {
	t.Setenv("PIPELINE_REPOS", "good/repo,bad-slug,another/valid")
	repos := ghpGetRepos()
	if len(repos) != 2 {
		t.Fatalf("expected 2 valid repos, got %d: %v", len(repos), repos)
	}
	if repos[0] != "good/repo" {
		t.Errorf("expected good/repo, got %q", repos[0])
	}
}

// ---------------------------------------------------------------------------
// ghpValidRepoPattern — path-traversal prevention regex
// ---------------------------------------------------------------------------

func TestGhpValidRepoPattern(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"standard repo", "kubestellar/console", true},
		{"with dots", "org.name/repo.name", true},
		{"with hyphens", "my-org/my-repo", true},
		{"with underscores", "my_org/my_repo", true},
		{"single char", "a/b", true},

		// Invalid / adversarial
		{"no slash", "noslash", false},
		{"empty string", "", false},
		{"double slash", "org//repo", false},
		{"path traversal", "../../../etc", false},
		{"path traversal in repo", "org/../secret", false},
		{"space in name", "org/repo name", false},
		{"url encoded", "org%2Frepo", false},
		{"trailing slash", "org/repo/", false},
		{"leading slash", "/org/repo", false},
		{"newline injection", "org/repo\nmalicious", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpValidRepoPattern.MatchString(tt.input)
			if got != tt.valid {
				t.Errorf("ghpValidRepoPattern.MatchString(%q) = %v, want %v", tt.input, got, tt.valid)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpIsAllowedRepo — allowlist check with regex pre-validation
// ---------------------------------------------------------------------------

func TestGhpIsAllowedRepo_Listed(t *testing.T) {
	os.Unsetenv("PIPELINE_REPOS")
	// ghpDefaultRepos should be allowed
	if !ghpIsAllowedRepo(ghpDefaultRepos[0]) {
		t.Errorf("expected %q to be allowed", ghpDefaultRepos[0])
	}
}

func TestGhpIsAllowedRepo_CaseInsensitive(t *testing.T) {
	os.Unsetenv("PIPELINE_REPOS")
	first := ghpDefaultRepos[0]
	upper := ""
	for _, c := range first {
		if c >= 'a' && c <= 'z' {
			upper += string(c - 32)
		} else {
			upper += string(c)
		}
	}
	if !ghpIsAllowedRepo(upper) {
		t.Errorf("expected case-insensitive match for %q", upper)
	}
}

func TestGhpIsAllowedRepo_NotListed(t *testing.T) {
	os.Unsetenv("PIPELINE_REPOS")
	if ghpIsAllowedRepo("evil/repo") {
		t.Error("expected evil/repo to be rejected")
	}
}

func TestGhpIsAllowedRepo_InvalidFormat(t *testing.T) {
	if ghpIsAllowedRepo("no-slash") {
		t.Error("expected invalid format to be rejected")
	}
}

func TestGhpIsAllowedRepo_PathTraversal(t *testing.T) {
	if ghpIsAllowedRepo("../../../etc") {
		t.Error("expected path traversal to be rejected")
	}
}

func TestGhpIsAllowedRepo_Empty(t *testing.T) {
	if ghpIsAllowedRepo("") {
		t.Error("expected empty string to be rejected")
	}
}

// ---------------------------------------------------------------------------
// ghpNightlyTagRe — nightly release tag matching
// ---------------------------------------------------------------------------

func TestGhpNightlyTagRe(t *testing.T) {
	tests := []struct {
		tag   string
		match bool
	}{
		{"v0.3.21-nightly.20260417", true},
		{"nightly-build", true},
		{"v1.0.0-NIGHTLY-20260101", true},
		{"v1.0.0", false},
		{"v2.0.0-beta.1", false},
		{"release-candidate", false},
	}

	for _, tt := range tests {
		t.Run(tt.tag, func(t *testing.T) {
			got := ghpNightlyTagRe.MatchString(tt.tag)
			if got != tt.match {
				t.Errorf("ghpNightlyTagRe.MatchString(%q) = %v, want %v", tt.tag, got, tt.match)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpPRFromCommitRe — PR number extraction from merge commit messages
// ---------------------------------------------------------------------------

func TestGhpPRFromCommitRe(t *testing.T) {
	tests := []struct {
		msg   string
		match bool
		pr    string
	}{
		{"feat: something (#8673)", true, "8673"},
		{"fix: bug in auth (#123)", true, "123"},
		{"Merge pull request #45 from branch", false, ""},
		{"no pr reference here", false, ""},
		{"trailing space (#999) ", true, "999"},
	}

	for _, tt := range tests {
		t.Run(tt.msg, func(t *testing.T) {
			matches := ghpPRFromCommitRe.FindStringSubmatch(tt.msg)
			if tt.match {
				if len(matches) < 2 {
					t.Fatalf("expected match with PR number, got %v", matches)
				}
				if matches[1] != tt.pr {
					t.Errorf("expected PR %q, got %q", tt.pr, matches[1])
				}
			} else {
				if len(matches) > 0 {
					t.Errorf("expected no match, got %v", matches)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpHistory — merge and snapshot
// ---------------------------------------------------------------------------

func TestGhpHistory_NewEmpty(t *testing.T) {
	h := newGHPHistory()
	snap := h.snapshot()
	if len(snap) != 0 {
		t.Errorf("expected empty snapshot, got %d repos", len(snap))
	}
}

func TestGhpHistory_MergeBasic(t *testing.T) {
	h := newGHPHistory()
	conclusion := "success"
	runs := []ghpWorkflowRun{
		{
			ID:         1,
			Repo:       "org/repo",
			Name:       "CI",
			CreatedAt:  "2026-06-01T10:00:00Z",
			Conclusion: &conclusion,
			HTMLURL:    "https://github.com/org/repo/actions/runs/1",
		},
	}
	h.merge(runs)

	snap := h.snapshot()
	if _, ok := snap["org/repo"]; !ok {
		t.Fatal("expected org/repo in snapshot")
	}
	if _, ok := snap["org/repo"]["CI"]; !ok {
		t.Fatal("expected CI workflow in snapshot")
	}
	day, ok := snap["org/repo"]["CI"]["2026-06-01"]
	if !ok {
		t.Fatal("expected 2026-06-01 entry")
	}
	if day.RunID != 1 {
		t.Errorf("expected RunID 1, got %d", day.RunID)
	}
}

func TestGhpHistory_MergeKeepsLatestRun(t *testing.T) {
	h := newGHPHistory()
	c1, c2 := "failure", "success"
	runs := []ghpWorkflowRun{
		{ID: 1, Repo: "org/repo", Name: "CI", CreatedAt: "2026-06-01T10:00:00Z", Conclusion: &c1},
		{ID: 5, Repo: "org/repo", Name: "CI", CreatedAt: "2026-06-01T14:00:00Z", Conclusion: &c2},
	}
	h.merge(runs)

	snap := h.snapshot()
	day := snap["org/repo"]["CI"]["2026-06-01"]
	if day.RunID != 5 {
		t.Errorf("expected latest RunID 5, got %d", day.RunID)
	}
	if *day.Conclusion != "success" {
		t.Errorf("expected conclusion 'success', got %q", *day.Conclusion)
	}
}

func TestGhpHistory_MergeSkipsShortCreatedAt(t *testing.T) {
	h := newGHPHistory()
	runs := []ghpWorkflowRun{
		{ID: 1, Repo: "org/repo", Name: "CI", CreatedAt: "short"},
	}
	h.merge(runs)
	snap := h.snapshot()
	if len(snap) != 0 {
		t.Errorf("expected empty snapshot for short CreatedAt, got %d repos", len(snap))
	}
}

func TestGhpHistory_MergeInProgressConclusion(t *testing.T) {
	h := newGHPHistory()
	runs := []ghpWorkflowRun{
		{ID: 1, Repo: "org/repo", Name: "CI", CreatedAt: "2026-06-01T10:00:00Z", Status: "in_progress"},
	}
	h.merge(runs)
	snap := h.snapshot()
	day := snap["org/repo"]["CI"]["2026-06-01"]
	if day.Conclusion == nil {
		t.Fatal("expected non-nil conclusion for in_progress run")
	}
	if *day.Conclusion != "in_progress" {
		t.Errorf("expected 'in_progress' conclusion, got %q", *day.Conclusion)
	}
}

func TestGhpHistory_SnapshotIsDeepCopy(t *testing.T) {
	h := newGHPHistory()
	c := "success"
	h.merge([]ghpWorkflowRun{
		{ID: 1, Repo: "org/repo", Name: "CI", CreatedAt: "2026-06-01T10:00:00Z", Conclusion: &c},
	})

	snap1 := h.snapshot()
	// Mutate the snapshot
	delete(snap1["org/repo"]["CI"], "2026-06-01")

	// Original should be unaffected
	snap2 := h.snapshot()
	if _, ok := snap2["org/repo"]["CI"]["2026-06-01"]; !ok {
		t.Error("snapshot mutation leaked into original data")
	}
}

func TestGhpHistory_ConcurrentMerge(t *testing.T) {
	h := newGHPHistory()
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			c := "success"
			h.merge([]ghpWorkflowRun{
				{ID: id, Repo: "org/repo", Name: "CI", CreatedAt: "2026-06-01T10:00:00Z", Conclusion: &c},
			})
			_ = h.snapshot()
		}(int64(i))
	}
	wg.Wait()
	// No race detector panic = pass
}
