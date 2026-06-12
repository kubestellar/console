package handlers

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers/feedback"
	"github.com/kubestellar/console/pkg/rewards"
)

func TestIsConsoleAppSubmitted(t *testing.T) {
	t.Setenv(feedback.AppSlugEnv, "")
	cases := []struct {
		name string
		app  *searchApp
		want bool
	}{
		{"nil app", nil, false},
		{"wrong slug", &searchApp{Slug: "dependabot"}, false},
		{"empty slug", &searchApp{Slug: ""}, false},
		{"matching slug", &searchApp{Slug: feedback.DefaultConsoleAppSlug}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			item := searchItem{PerformedViaGitHubApp: c.app}
			if got := isConsoleAppSubmitted(item); got != c.want {
				t.Errorf("got %v, want %v", got, c.want)
			}
		})
	}
}

func TestRequiresAppAttribution(t *testing.T) {
	cases := []struct {
		name      string
		cutoff    string
		createdAt string
		want      bool
	}{
		{"no cutoff set → disabled", "", "2026-05-01T00:00:00Z", false},
		{"issue before cutoff → grandfathered", "2026-04-13T00:00:00Z", "2026-04-01T00:00:00Z", false},
		{"issue after cutoff → enforced", "2026-04-13T00:00:00Z", "2026-05-01T00:00:00Z", true},
		{"malformed cutoff → fail-safe to disabled", "not-a-timestamp", "2026-05-01T00:00:00Z", false},
		{"malformed created_at → fail-safe to disabled", "2026-04-13T00:00:00Z", "bogus", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv(attributionEnforcementCutoffEnv, c.cutoff)
			if got := requiresAppAttribution(c.createdAt); got != c.want {
				t.Errorf("got %v, want %v", got, c.want)
			}
		})
	}
}

func TestClassifyIssue_GrandfatheringBeforeCutoff(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "")
	item := searchItem{
		Title:     "Bug: something broken",
		CreatedAt: "2026-04-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "bug"}},
	}
	c := classifyIssue(item)
	if c.Points != rewards.PointsBugIssue {
		t.Errorf("pre-cutoff bug should get %d pts, got %d", rewards.PointsBugIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_AppSubmitted(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	t.Setenv(feedback.AppSlugEnv, "")
	item := searchItem{
		Title:                 "Bug: via console",
		CreatedAt:             "2026-05-01T00:00:00Z",
		Labels:                []searchLabel{{Name: "bug"}},
		PerformedViaGitHubApp: &searchApp{Slug: feedback.DefaultConsoleAppSlug},
	}
	c := classifyIssue(item)
	if c.Points != rewards.PointsBugIssue {
		t.Errorf("App-submitted bug should get %d pts, got %d", rewards.PointsBugIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_NotAppSubmitted(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	item := searchItem{
		Title:     "Bug: via github.com",
		CreatedAt: "2026-05-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "bug"}},
	}
	c := classifyIssue(item)
	if c.Type != "issue_bug" {
		t.Errorf("type should still be issue_bug, got %s", c.Type)
	}
	if c.Points != rewards.PointsOtherIssue {
		t.Errorf("post-cutoff github.com bug should drop to %d pts, got %d", rewards.PointsOtherIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_Feature(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	github := searchItem{
		Title:     "Feature: cool idea",
		CreatedAt: "2026-05-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "enhancement"}},
	}
	if c := classifyIssue(github); c.Points != rewards.PointsOtherIssue {
		t.Errorf("post-cutoff github.com feature should drop to %d, got %d", rewards.PointsOtherIssue, c.Points)
	}
	app := searchItem{
		Title:                 "Feature: cool idea",
		CreatedAt:             "2026-05-01T00:00:00Z",
		Labels:                []searchLabel{{Name: "enhancement"}},
		PerformedViaGitHubApp: &searchApp{Slug: feedback.DefaultConsoleAppSlug},
	}
	if c := classifyIssue(app); c.Points != rewards.PointsFeatureIssue {
		t.Errorf("post-cutoff App feature should get %d, got %d", rewards.PointsFeatureIssue, c.Points)
	}
}
