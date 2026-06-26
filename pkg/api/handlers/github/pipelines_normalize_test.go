package github

import (
	"testing"
	"time"
)

func TestNormalizeRunRaw_BasicFields(t *testing.T) {
	t.Helper()
	success := "success"
	raw := workflowRunRaw{
		ID:         42,
		Name:       "CI",
		WorkflowID: 7,
		HeadBranch: "main",
		Status:     "completed",
		Conclusion: &success,
		Event:      "push",
		RunNumber:  10,
		HTMLURL:    "https://github.com/o/r/actions/runs/42",
		CreatedAt:  "2026-06-01T00:00:00Z",
		UpdatedAt:  "2026-06-01T00:05:00Z",
	}

	got := normalizeRunRaw(raw, "kubestellar/console")

	if got.ID != 42 {
		t.Errorf("ID = %d, want 42", got.ID)
	}
	if got.Repo != "kubestellar/console" {
		t.Errorf("Repo = %q, want %q", got.Repo, "kubestellar/console")
	}
	if got.Name != "CI" {
		t.Errorf("Name = %q, want %q", got.Name, "CI")
	}
	if got.WorkflowID != 7 {
		t.Errorf("WorkflowID = %d, want 7", got.WorkflowID)
	}
	if got.HeadBranch != "main" {
		t.Errorf("HeadBranch = %q, want %q", got.HeadBranch, "main")
	}
	if got.Status != "completed" {
		t.Errorf("Status = %q, want %q", got.Status, "completed")
	}
	if got.Conclusion == nil || *got.Conclusion != "success" {
		t.Errorf("Conclusion = %v, want %q", got.Conclusion, "success")
	}
	if got.Event != "push" {
		t.Errorf("Event = %q, want %q", got.Event, "push")
	}
	if got.RunNumber != 10 {
		t.Errorf("RunNumber = %d, want 10", got.RunNumber)
	}
	if got.HTMLURL != "https://github.com/o/r/actions/runs/42" {
		t.Errorf("HTMLURL = %q", got.HTMLURL)
	}
	if got.CreatedAt != "2026-06-01T00:00:00Z" {
		t.Errorf("CreatedAt = %q", got.CreatedAt)
	}
	if got.UpdatedAt != "2026-06-01T00:05:00Z" {
		t.Errorf("UpdatedAt = %q", got.UpdatedAt)
	}
}

func TestNormalizeRunRaw_CopiesPullRequests(t *testing.T) {
	raw := workflowRunRaw{
		Event: "pull_request",
		PullRequests: []struct {
			Number int    `json:"number"`
			URL    string `json:"url"`
		}{
			{Number: 100, URL: "https://github.com/o/r/pull/100"},
			{Number: 101, URL: "https://github.com/o/r/pull/101"},
		},
	}

	got := normalizeRunRaw(raw, "o/r")

	if len(got.PullRequests) != 2 {
		t.Fatalf("PullRequests len = %d, want 2", len(got.PullRequests))
	}
	if got.PullRequests[0].Number != 100 {
		t.Errorf("PR[0].Number = %d, want 100", got.PullRequests[0].Number)
	}
	if got.PullRequests[1].URL != "https://github.com/o/r/pull/101" {
		t.Errorf("PR[1].URL = %q", got.PullRequests[1].URL)
	}
}

func TestNormalizeRunRaw_ExtractsPRFromCommitMessage(t *testing.T) {
	raw := workflowRunRaw{
		Event: "push",
		HeadCommit: struct {
			Message string `json:"message"`
		}{
			Message: "feat: add cool feature (#123)",
		},
	}

	got := normalizeRunRaw(raw, "kubestellar/console")

	if len(got.PullRequests) != 1 {
		t.Fatalf("PullRequests len = %d, want 1", len(got.PullRequests))
	}
	if got.PullRequests[0].Number != 123 {
		t.Errorf("PR Number = %d, want 123", got.PullRequests[0].Number)
	}
	if got.PullRequests[0].URL != "https://github.com/kubestellar/console/pull/123" {
		t.Errorf("PR URL = %q", got.PullRequests[0].URL)
	}
}

func TestNormalizeRunRaw_NoPRExtractionWhenPRsExist(t *testing.T) {
	raw := workflowRunRaw{
		Event: "push",
		PullRequests: []struct {
			Number int    `json:"number"`
			URL    string `json:"url"`
		}{
			{Number: 50, URL: "https://github.com/o/r/pull/50"},
		},
		HeadCommit: struct {
			Message string `json:"message"`
		}{
			Message: "fix: thing (#999)",
		},
	}

	got := normalizeRunRaw(raw, "o/r")

	// Should use existing PRs, not extract from commit message
	if len(got.PullRequests) != 1 {
		t.Fatalf("PullRequests len = %d, want 1", len(got.PullRequests))
	}
	if got.PullRequests[0].Number != 50 {
		t.Errorf("PR Number = %d, want 50 (existing)", got.PullRequests[0].Number)
	}
}

func TestNormalizeRunRaw_NoPRExtractionOnNonPushEvent(t *testing.T) {
	raw := workflowRunRaw{
		Event: "schedule",
		HeadCommit: struct {
			Message string `json:"message"`
		}{
			Message: "fix: thing (#999)",
		},
	}

	got := normalizeRunRaw(raw, "o/r")

	if len(got.PullRequests) != 0 {
		t.Errorf("PullRequests len = %d, want 0 for non-push event", len(got.PullRequests))
	}
}

func TestGHPParseMatrixDays(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{"empty returns default", "", ghpMatrixDefaultDays},
		{"valid number", "30", 30},
		{"exceeds max clamped", "200", ghpMatrixMaxDays},
		{"exactly max", "90", ghpMatrixMaxDays},
		{"negative returns default", "-5", ghpMatrixDefaultDays},
		{"zero returns default", "0", ghpMatrixDefaultDays},
		{"non-numeric returns default", "abc", ghpMatrixDefaultDays},
		{"one is valid", "1", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpParseMatrixDays(tt.raw)
			if got != tt.want {
				t.Errorf("ghpParseMatrixDays(%q) = %d, want %d", tt.raw, got, tt.want)
			}
		})
	}
}

func TestGHPBuildPulseRecent(t *testing.T) {
	success := "success"
	failure := "failure"
	runs := make([]ghpWorkflowRun, 20)
	for i := range runs {
		c := &success
		if i%3 == 0 {
			c = &failure
		}
		runs[i] = ghpWorkflowRun{
			Conclusion: c,
			CreatedAt:  "2026-06-01T00:00:00Z",
			HTMLURL:    "https://example.com/run",
		}
	}

	recent := ghpBuildPulseRecent(runs)

	// Should be capped at ghpPulseWindowDays
	if len(recent) != ghpPulseWindowDays {
		t.Errorf("len(recent) = %d, want %d", len(recent), ghpPulseWindowDays)
	}
	// Verify fields are copied
	if recent[0].HTMLURL != "https://example.com/run" {
		t.Errorf("HTMLURL not copied")
	}
	if *recent[0].Conclusion != "failure" {
		t.Errorf("Conclusion[0] = %q, want failure", *recent[0].Conclusion)
	}
}

func TestGHPBuildPulseRecent_FewRuns(t *testing.T) {
	success := "success"
	runs := []ghpWorkflowRun{
		{Conclusion: &success, CreatedAt: "2026-06-01T00:00:00Z", HTMLURL: "u1"},
		{Conclusion: &success, CreatedAt: "2026-06-02T00:00:00Z", HTMLURL: "u2"},
	}

	recent := ghpBuildPulseRecent(runs)

	if len(recent) != 2 {
		t.Errorf("len(recent) = %d, want 2", len(recent))
	}
}

func TestGHPBuildPulseRecent_EmptyRuns(t *testing.T) {
	recent := ghpBuildPulseRecent(nil)
	if recent == nil {
		t.Fatal("expected non-nil slice")
	}
	if len(recent) != 0 {
		t.Errorf("len(recent) = %d, want 0", len(recent))
	}
}

func TestGHPBuildRangeDates(t *testing.T) {
	dates := ghpBuildRangeDates(7)

	if len(dates) != 7 {
		t.Fatalf("len(dates) = %d, want 7", len(dates))
	}
	// Verify each entry is a parseable YYYY-MM-DD string
	for i, d := range dates {
		if _, err := time.Parse("2006-01-02", d); err != nil {
			t.Errorf("dates[%d] = %q is not a valid YYYY-MM-DD: %v", i, d, err)
		}
	}
	// Dates must be strictly ascending (consecutive days)
	for i := 1; i < len(dates); i++ {
		if dates[i] <= dates[i-1] {
			t.Errorf("dates not ascending at index %d: %q <= %q", i, dates[i], dates[i-1])
		}
		prev, _ := time.Parse("2006-01-02", dates[i-1])
		curr, _ := time.Parse("2006-01-02", dates[i])
		if curr.Sub(prev) != 24*time.Hour {
			t.Errorf("dates[%d] and dates[%d] are not consecutive days: %q, %q", i-1, i, dates[i-1], dates[i])
		}
	}
}

func TestGHPBuildRangeDates_SingleDay(t *testing.T) {
	dates := ghpBuildRangeDates(1)
	if len(dates) != 1 {
		t.Fatalf("len(dates) = %d, want 1", len(dates))
	}
	if _, err := time.Parse("2006-01-02", dates[0]); err != nil {
		t.Errorf("single date %q is not a valid YYYY-MM-DD: %v", dates[0], err)
	}
}

func TestGHPFailureDuration(t *testing.T) {
	tests := []struct {
		name    string
		created string
		updated string
		wantMs  int64
	}{
		{
			name:    "5 minutes",
			created: "2026-06-01T10:00:00Z",
			updated: "2026-06-01T10:05:00Z",
			wantMs:  300000,
		},
		{
			name:    "zero duration",
			created: "2026-06-01T10:00:00Z",
			updated: "2026-06-01T10:00:00Z",
			wantMs:  0,
		},
		{
			name:    "negative duration returns 0",
			created: "2026-06-01T10:05:00Z",
			updated: "2026-06-01T10:00:00Z",
			wantMs:  0,
		},
		{
			name:    "invalid timestamps return 0",
			created: "not-a-date",
			updated: "also-not-a-date",
			wantMs:  0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := ghpWorkflowRun{
				CreatedAt: tt.created,
				UpdatedAt: tt.updated,
			}
			got := ghpFailureDuration(r)
			if got != tt.wantMs {
				t.Errorf("ghpFailureDuration() = %d ms, want %d ms", got, tt.wantMs)
			}
		})
	}
}

func TestGHPFirstFailedStep(t *testing.T) {
	success := "success"
	failure := "failure"

	t.Run("finds first failed step", func(t *testing.T) {
		jobs := []ghpJob{
			{
				ID:         1,
				Name:       "build",
				Conclusion: &success,
				Steps: []ghpStep{
					{Name: "checkout", Conclusion: &success},
				},
			},
			{
				ID:         2,
				Name:       "test",
				Conclusion: &failure,
				Steps: []ghpStep{
					{Name: "setup", Conclusion: &success},
					{Name: "run tests", Conclusion: &failure},
					{Name: "upload", Conclusion: &failure},
				},
			},
		}

		got := ghpFirstFailedStep(jobs)
		if got == nil {
			t.Fatal("expected non-nil result")
		}
		if got.JobID != 2 {
			t.Errorf("JobID = %d, want 2", got.JobID)
		}
		if got.JobName != "test" {
			t.Errorf("JobName = %q, want %q", got.JobName, "test")
		}
		if got.StepName != "run tests" {
			t.Errorf("StepName = %q, want %q", got.StepName, "run tests")
		}
	})

	t.Run("returns nil when no failures", func(t *testing.T) {
		jobs := []ghpJob{
			{
				ID:         1,
				Name:       "build",
				Conclusion: &success,
				Steps: []ghpStep{
					{Name: "checkout", Conclusion: &success},
				},
			},
		}
		got := ghpFirstFailedStep(jobs)
		if got != nil {
			t.Errorf("expected nil, got %+v", got)
		}
	})

	t.Run("returns nil for empty jobs", func(t *testing.T) {
		got := ghpFirstFailedStep(nil)
		if got != nil {
			t.Errorf("expected nil, got %+v", got)
		}
	})

	t.Run("skips jobs with nil conclusion", func(t *testing.T) {
		jobs := []ghpJob{
			{
				ID:   1,
				Name: "in-progress",
				// Conclusion is nil (still running)
				Steps: []ghpStep{
					{Name: "step1", Conclusion: &failure},
				},
			},
		}
		got := ghpFirstFailedStep(jobs)
		if got != nil {
			t.Errorf("expected nil for nil-conclusion job, got %+v", got)
		}
	})

	t.Run("skips steps with nil conclusion", func(t *testing.T) {
		jobs := []ghpJob{
			{
				ID:         1,
				Name:       "test",
				Conclusion: &failure,
				Steps: []ghpStep{
					{Name: "pending-step", Conclusion: nil},
					{Name: "failed-step", Conclusion: &failure},
				},
			},
		}
		got := ghpFirstFailedStep(jobs)
		if got == nil {
			t.Fatal("expected non-nil")
		}
		if got.StepName != "failed-step" {
			t.Errorf("StepName = %q, want %q", got.StepName, "failed-step")
		}
	})
}

func TestGHPResolveRepos(t *testing.T) {
	// Set a known allowlist so tests are hermetic regardless of environment.
	t.Setenv("PIPELINE_REPOS", "kubestellar/console,kubestellar/docs")

	t.Run("empty filter returns all repos", func(t *testing.T) {
		repos, err := ghpResolveRepos("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(repos) != 2 {
			t.Errorf("len = %d, want 2", len(repos))
		}
	})

	t.Run("valid repo returns single-element slice", func(t *testing.T) {
		repos, err := ghpResolveRepos("kubestellar/console")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(repos) != 1 {
			t.Errorf("len = %d, want 1", len(repos))
		}
		if repos[0] != "kubestellar/console" {
			t.Errorf("repo = %q, want %q", repos[0], "kubestellar/console")
		}
	})

	t.Run("disallowed repo returns error", func(t *testing.T) {
		_, err := ghpResolveRepos("evil/repo-not-allowed")
		if err == nil {
			t.Error("expected error for disallowed repo")
		}
	})
}
