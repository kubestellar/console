package github

import (
	"testing"
)

func strPtr(s string) *string { return &s }

func TestSuccessRate_Empty(t *testing.T) {
	if got := successRate(nil); got != 0 {
		t.Errorf("empty runs should be 0, got %v", got)
	}
	if got := successRate([]NightlyRun{}); got != 0 {
		t.Errorf("empty slice should be 0, got %v", got)
	}
}

func TestSuccessRate_AllPassing(t *testing.T) {
	runs := []NightlyRun{
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
	}
	if got := successRate(runs); got != 1.0 {
		t.Errorf("expected 1.0, got %v", got)
	}
}

func TestSuccessRate_MixedIgnoresInProgress(t *testing.T) {
	// nil Conclusion (in_progress) still counts against the total, since
	// successRate divides passed by len(runs). That's the documented behavior:
	// this test locks it in so any change is deliberate.
	runs := []NightlyRun{
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("failure")},
		{Conclusion: nil},
		{Conclusion: strPtr("success")},
	}
	got := successRate(runs)
	want := 2.0 / 4.0
	if got != want {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestSuccessRate_NonSuccessConclusions(t *testing.T) {
	runs := []NightlyRun{
		{Conclusion: strPtr("cancelled")},
		{Conclusion: strPtr("skipped")},
		{Conclusion: strPtr("timed_out")},
	}
	if got := successRate(runs); got != 0 {
		t.Errorf("non-success conclusions should yield 0, got %v", got)
	}
}

func TestComputeTrend_FewerThan4Steady(t *testing.T) {
	for n := 0; n < 4; n++ {
		runs := make([]NightlyRun, n)
		for i := range runs {
			runs[i].Conclusion = strPtr("success")
		}
		if got := computeTrend(runs); got != "steady" {
			t.Errorf("len=%d expected steady, got %q", n, got)
		}
	}
}

func TestComputeTrend_Up(t *testing.T) {
	// Recent 3 all success, older 3 all failure — should trend up.
	runs := []NightlyRun{
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("failure")},
		{Conclusion: strPtr("failure")},
		{Conclusion: strPtr("failure")},
	}
	if got := computeTrend(runs); got != "up" {
		t.Errorf("expected up, got %q", got)
	}
}

func TestComputeTrend_Down(t *testing.T) {
	// Recent 3 all failure, older 3 all success — should trend down.
	runs := []NightlyRun{
		{Conclusion: strPtr("failure")},
		{Conclusion: strPtr("failure")},
		{Conclusion: strPtr("failure")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
	}
	if got := computeTrend(runs); got != "down" {
		t.Errorf("expected down, got %q", got)
	}
}

func TestComputeTrend_SteadyWhenEqual(t *testing.T) {
	runs := []NightlyRun{
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
		{Conclusion: strPtr("success")},
	}
	if got := computeTrend(runs); got != "steady" {
		t.Errorf("expected steady, got %q", got)
	}
}

func TestHasInProgressRuns(t *testing.T) {
	// No in_progress
	guides := []NightlyGuideStatus{
		{Runs: []NightlyRun{{Status: "completed"}, {Status: "queued"}}},
		{Runs: []NightlyRun{{Status: "completed"}}},
	}
	if hasInProgressRuns(guides) {
		t.Errorf("expected false without in_progress")
	}
	// With in_progress
	guides[1].Runs = append(guides[1].Runs, NightlyRun{Status: "in_progress"})
	if !hasInProgressRuns(guides) {
		t.Errorf("expected true when a guide has an in_progress run")
	}
}

func TestIsAllowedRepo(t *testing.T) {
	if !isAllowedRepo("llm-d/llm-d") {
		t.Errorf("llm-d/llm-d should be in the allowlist")
	}
	if isAllowedRepo("attacker/repo") {
		t.Errorf("attacker/repo must not be allowed")
	}
	if isAllowedRepo("") {
		t.Errorf("empty repo must not be allowed")
	}
}
