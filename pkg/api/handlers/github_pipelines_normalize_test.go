package handlers

import (
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// ghpStreakKind — streak classification for CI health pulse
// ---------------------------------------------------------------------------

func TestGhpStreakKind(t *testing.T) {
	success := "success"
	failure := "failure"
	timedOut := "timed_out"
	cancelled := "cancelled"

	tests := []struct {
		name string
		input *string
		want  string
	}{
		{"nil conclusion", nil, ""},
		{"success", &success, "success"},
		{"failure", &failure, "failure"},
		{"timed_out maps to failure", &timedOut, "failure"},
		{"cancelled maps to empty", &cancelled, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpStreakKind(tt.input)
			if got != tt.want {
				t.Errorf("ghpStreakKind() = %q, want %q", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpParseMatrixDays — days parameter parsing with bounds
// ---------------------------------------------------------------------------

func TestGhpParseMatrixDays(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{"empty uses default", "", ghpMatrixDefaultDays},
		{"valid number", "7", 7},
		{"zero uses default", "0", ghpMatrixDefaultDays},
		{"negative uses default", "-5", ghpMatrixDefaultDays},
		{"non-numeric uses default", "abc", ghpMatrixDefaultDays},
		{"exceeds max clamped", "200", ghpMatrixMaxDays},
		{"at max", "90", ghpMatrixMaxDays},
		{"just below max", "89", 89},
		{"one", "1", 1},
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

// ---------------------------------------------------------------------------
// ghpBuildRangeDates — date range generation for matrix view
// ---------------------------------------------------------------------------

func TestGhpBuildRangeDates(t *testing.T) {
	tests := []struct {
		name string
		days int
		want int // expected length
	}{
		{"1 day", 1, 1},
		{"7 days", 7, 7},
		{"14 days", 14, 14},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpBuildRangeDates(tt.days)
			if len(got) != tt.want {
				t.Errorf("ghpBuildRangeDates(%d) returned %d dates, want %d",
					tt.days, len(got), tt.want)
			}
			// Verify format is YYYY-MM-DD
			for _, d := range got {
				_, err := time.Parse("2006-01-02", d)
				if err != nil {
					t.Errorf("date %q is not valid YYYY-MM-DD format", d)
				}
			}
			// Last date should be today
			today := time.Now().UTC().Format("2006-01-02")
			if got[len(got)-1] != today {
				t.Errorf("last date = %q, want today %q", got[len(got)-1], today)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpFailureDuration — failure duration in milliseconds
// ---------------------------------------------------------------------------

func TestGhpFailureDuration(t *testing.T) {
	tests := []struct {
		name    string
		run     ghpWorkflowRun
		wantMin int64
		wantMax int64
	}{
		{
			"normal duration",
			ghpWorkflowRun{
				CreatedAt: "2026-06-08T10:00:00Z",
				UpdatedAt: "2026-06-08T10:05:00Z",
			},
			300000, 300000, // 5 minutes in ms
		},
		{
			"zero duration same time",
			ghpWorkflowRun{
				CreatedAt: "2026-06-08T10:00:00Z",
				UpdatedAt: "2026-06-08T10:00:00Z",
			},
			0, 0,
		},
		{
			"negative duration returns 0",
			ghpWorkflowRun{
				CreatedAt: "2026-06-08T10:05:00Z",
				UpdatedAt: "2026-06-08T10:00:00Z",
			},
			0, 0,
		},
		{
			"invalid timestamps return 0",
			ghpWorkflowRun{
				CreatedAt: "not-a-date",
				UpdatedAt: "also-not-a-date",
			},
			0, 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpFailureDuration(tt.run)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("ghpFailureDuration() = %d, want between %d and %d",
					got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpFirstFailedStep — extract first failing step from job list
// ---------------------------------------------------------------------------

func TestGhpFirstFailedStep(t *testing.T) {
	failure := "failure"
	success := "success"

	tests := []struct {
		name     string
		jobs     []ghpJob
		wantNil  bool
		wantStep string
	}{
		{"nil jobs", nil, true, ""},
		{"empty jobs", []ghpJob{}, true, ""},
		{"all success", []ghpJob{
			{ID: 1, Name: "build", Conclusion: &success, Steps: []ghpStep{
				{Name: "checkout", Conclusion: &success},
			}},
		}, true, ""},
		{"first failed step found", []ghpJob{
			{ID: 1, Name: "build", Conclusion: &failure, Steps: []ghpStep{
				{Name: "checkout", Conclusion: &success},
				{Name: "compile", Conclusion: &failure},
				{Name: "test", Conclusion: &failure},
			}},
		}, false, "compile"},
		{"skips successful jobs", []ghpJob{
			{ID: 1, Name: "lint", Conclusion: &success, Steps: []ghpStep{
				{Name: "lint-step", Conclusion: &success},
			}},
			{ID: 2, Name: "test", Conclusion: &failure, Steps: []ghpStep{
				{Name: "setup", Conclusion: &success},
				{Name: "run-tests", Conclusion: &failure},
			}},
		}, false, "run-tests"},
		{"job failed but no step marked", []ghpJob{
			{ID: 1, Name: "deploy", Conclusion: &failure, Steps: []ghpStep{
				{Name: "step1", Conclusion: &success},
			}},
		}, true, ""},
		{"nil conclusion on job", []ghpJob{
			{ID: 1, Name: "pending", Conclusion: nil, Steps: []ghpStep{}},
		}, true, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpFirstFailedStep(tt.jobs)
			if tt.wantNil {
				if got != nil {
					t.Errorf("expected nil, got %+v", got)
				}
				return
			}
			if got == nil {
				t.Fatal("expected non-nil result")
			}
			if got.StepName != tt.wantStep {
				t.Errorf("StepName = %q, want %q", got.StepName, tt.wantStep)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ghpBuildPulseRecent — recent pulse window extraction
// ---------------------------------------------------------------------------

func TestGhpBuildPulseRecent(t *testing.T) {
	success := "success"
	failure := "failure"

	tests := []struct {
		name     string
		runs     []ghpWorkflowRun
		wantLen  int
	}{
		{"nil runs", nil, 0},
		{"empty runs", []ghpWorkflowRun{}, 0},
		{"fewer than window", []ghpWorkflowRun{
			{Conclusion: &success, CreatedAt: "2026-06-08T10:00:00Z", HTMLURL: "url1"},
			{Conclusion: &failure, CreatedAt: "2026-06-07T10:00:00Z", HTMLURL: "url2"},
		}, 2},
		{"more than window truncated", func() []ghpWorkflowRun {
			runs := make([]ghpWorkflowRun, 20)
			for i := range runs {
				runs[i] = ghpWorkflowRun{Conclusion: &success, CreatedAt: "2026-06-08T10:00:00Z"}
			}
			return runs
		}(), ghpPulseWindowDays},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ghpBuildPulseRecent(tt.runs)
			if len(got) != tt.wantLen {
				t.Errorf("ghpBuildPulseRecent() returned %d items, want %d",
					len(got), tt.wantLen)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// normalizeRunRaw — raw GitHub API response to internal type
// ---------------------------------------------------------------------------

func TestNormalizeRunRaw(t *testing.T) {
	t.Run("basic fields mapped", func(t *testing.T) {
		raw := workflowRunRaw{
			ID:         12345,
			Name:       "CI",
			WorkflowID: 99,
			HeadBranch: "main",
			Status:     "completed",
			Event:      "push",
			RunNumber:  42,
			HTMLURL:    "https://github.com/org/repo/actions/runs/12345",
			CreatedAt:  "2026-06-08T10:00:00Z",
			UpdatedAt:  "2026-06-08T10:05:00Z",
		}

		got := normalizeRunRaw(raw, "org/repo")
		if got.ID != 12345 {
			t.Errorf("ID = %d, want 12345", got.ID)
		}
		if got.Repo != "org/repo" {
			t.Errorf("Repo = %q, want org/repo", got.Repo)
		}
		if got.Name != "CI" {
			t.Errorf("Name = %q, want CI", got.Name)
		}
		if got.RunNumber != 42 {
			t.Errorf("RunNumber = %d, want 42", got.RunNumber)
		}
	})

	t.Run("PR extracted from commit message", func(t *testing.T) {
		raw := workflowRunRaw{
			ID:    100,
			Event: "push",
		}
		raw.HeadCommit.Message = "Merge pull request (#42)"

		got := normalizeRunRaw(raw, "org/repo")
		if len(got.PullRequests) != 1 {
			t.Fatalf("expected 1 PR ref, got %d", len(got.PullRequests))
		}
		if got.PullRequests[0].Number != 42 {
			t.Errorf("PR number = %d, want 42", got.PullRequests[0].Number)
		}
		if got.PullRequests[0].URL != "https://github.com/org/repo/pull/42" {
			t.Errorf("PR URL = %q", got.PullRequests[0].URL)
		}
	})

	t.Run("explicit PRs not overridden by commit message", func(t *testing.T) {
		raw := workflowRunRaw{
			ID:    100,
			Event: "push",
		}
		raw.PullRequests = []struct {
			Number int    `json:"number"`
			URL    string `json:"url"`
		}{{Number: 99, URL: "https://github.com/org/repo/pull/99"}}
		raw.HeadCommit.Message = "fix: something (#42)"

		got := normalizeRunRaw(raw, "org/repo")
		if len(got.PullRequests) != 1 {
			t.Fatalf("expected 1 PR ref, got %d", len(got.PullRequests))
		}
		if got.PullRequests[0].Number != 99 {
			t.Errorf("should keep explicit PR 99, got %d", got.PullRequests[0].Number)
		}
	})

	t.Run("non-push event no PR extraction", func(t *testing.T) {
		raw := workflowRunRaw{
			ID:    100,
			Event: "schedule",
		}
		raw.HeadCommit.Message = "nightly (#10)"

		got := normalizeRunRaw(raw, "org/repo")
		if len(got.PullRequests) != 0 {
			t.Errorf("expected 0 PRs for schedule event, got %d", len(got.PullRequests))
		}
	})
}
