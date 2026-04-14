package handlers

import (
	"os"
	"testing"
)

func TestNewGitHubAppTokenProvider_MissingEnv(t *testing.T) {
	// Ensure all three env vars are unset.
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()
	if p != nil {
		t.Errorf("expected nil provider when env vars missing, got %v", p)
	}
}

func TestNewGitHubAppTokenProvider_PartialEnv(t *testing.T) {
	// Any missing var should result in nil (fail-safe).
	cases := []struct {
		name               string
		appID              string
		installationID     string
		privateKey         string
	}{
		{"no private key", "123", "456", ""},
		{"no app id", "", "456", "key"},
		{"no installation id", "123", "", "key"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv(appIDEnv, c.appID)
			t.Setenv(appInstallationIDEnv, c.installationID)
			t.Setenv(appPrivateKeyEnv, c.privateKey)
			if p := NewGitHubAppTokenProvider(); p != nil {
				t.Errorf("expected nil provider for %s, got %v", c.name, p)
			}
		})
	}
}

func TestExpectedAppSlug_Default(t *testing.T) {
	os.Unsetenv(appSlugEnv)
	if got := ExpectedAppSlug(); got != DefaultConsoleAppSlug {
		t.Errorf("expected default slug %q, got %q", DefaultConsoleAppSlug, got)
	}
}

func TestExpectedAppSlug_Override(t *testing.T) {
	t.Setenv(appSlugEnv, "my-fork-bot")
	if got := ExpectedAppSlug(); got != "my-fork-bot" {
		t.Errorf("expected override to apply, got %q", got)
	}
}

func TestIsConsoleAppSubmitted(t *testing.T) {
	t.Setenv(appSlugEnv, "")
	cases := []struct {
		name string
		app  *searchApp
		want bool
	}{
		{"nil app", nil, false},
		{"wrong slug", &searchApp{Slug: "dependabot"}, false},
		{"empty slug", &searchApp{Slug: ""}, false},
		{"matching slug", &searchApp{Slug: DefaultConsoleAppSlug}, true},
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
	// Phase 1: cutoff unset. Bug issues get 300 pts regardless of source.
	t.Setenv(attributionEnforcementCutoffEnv, "")
	item := searchItem{
		Title:     "Bug: something broken",
		CreatedAt: "2026-04-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "bug"}},
		// No performed_via_github_app — github.com submission
	}
	c := classifyIssue(item)
	if c.Points != pointsBugIssue {
		t.Errorf("pre-cutoff bug should get %d pts, got %d", pointsBugIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_AppSubmitted(t *testing.T) {
	// Phase 2: cutoff set, issue is App-submitted → full points.
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	t.Setenv(appSlugEnv, "")
	item := searchItem{
		Title:                 "Bug: via console",
		CreatedAt:             "2026-05-01T00:00:00Z",
		Labels:                []searchLabel{{Name: "bug"}},
		PerformedViaGitHubApp: &searchApp{Slug: DefaultConsoleAppSlug},
	}
	c := classifyIssue(item)
	if c.Points != pointsBugIssue {
		t.Errorf("App-submitted bug should get %d pts, got %d", pointsBugIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_NotAppSubmitted(t *testing.T) {
	// Phase 2: cutoff set, issue NOT App-submitted → dropped to 50 pts.
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	item := searchItem{
		Title:     "Bug: via github.com",
		CreatedAt: "2026-05-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "bug"}},
		// No performed_via_github_app — github.com submission after cutoff
	}
	c := classifyIssue(item)
	if c.Type != "issue_bug" {
		t.Errorf("type should still be issue_bug, got %s", c.Type)
	}
	if c.Points != pointsOtherIssue {
		t.Errorf("post-cutoff github.com bug should drop to %d pts, got %d", pointsOtherIssue, c.Points)
	}
}

func TestClassifyIssue_EnforcedAfterCutoff_Feature(t *testing.T) {
	t.Setenv(attributionEnforcementCutoffEnv, "2026-04-13T00:00:00Z")
	// github.com feature after cutoff → 50 pts
	github := searchItem{
		Title:     "Feature: cool idea",
		CreatedAt: "2026-05-01T00:00:00Z",
		Labels:    []searchLabel{{Name: "enhancement"}},
	}
	if c := classifyIssue(github); c.Points != pointsOtherIssue {
		t.Errorf("post-cutoff github.com feature should drop to %d, got %d", pointsOtherIssue, c.Points)
	}
	// App feature after cutoff → 100 pts
	app := searchItem{
		Title:                 "Feature: cool idea",
		CreatedAt:             "2026-05-01T00:00:00Z",
		Labels:                []searchLabel{{Name: "enhancement"}},
		PerformedViaGitHubApp: &searchApp{Slug: DefaultConsoleAppSlug},
	}
	if c := classifyIssue(app); c.Points != pointsFeatureIssue {
		t.Errorf("post-cutoff App feature should get %d, got %d", pointsFeatureIssue, c.Points)
	}
}
