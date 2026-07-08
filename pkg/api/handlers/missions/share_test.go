package missions

import (
	"os"
	"testing"
)

// ---------------------------------------------------------------------------
// isRepoAllowedForShareWithList
// ---------------------------------------------------------------------------

func TestIsRepoAllowedForShareWithList_ExactMatch(t *testing.T) {
	allowed := []string{"kubestellar/console-kb", "org/repo"}
	if !isRepoAllowedForShareWithList("kubestellar/console-kb", allowed) {
		t.Error("expected exact match to be allowed")
	}
}

func TestIsRepoAllowedForShareWithList_CaseInsensitive(t *testing.T) {
	allowed := []string{"kubestellar/console-kb"}
	cases := []string{
		"Kubestellar/Console-KB",
		"KUBESTELLAR/CONSOLE-KB",
		"KubeStellar/Console-Kb",
	}
	for _, repo := range cases {
		if !isRepoAllowedForShareWithList(repo, allowed) {
			t.Errorf("expected %q to be allowed (case-insensitive)", repo)
		}
	}
}

func TestIsRepoAllowedForShareWithList_NotAllowed(t *testing.T) {
	allowed := []string{"kubestellar/console-kb"}
	if isRepoAllowedForShareWithList("attacker/evil-repo", allowed) {
		t.Error("expected non-listed repo to be rejected")
	}
}

func TestIsRepoAllowedForShareWithList_EmptyList(t *testing.T) {
	if isRepoAllowedForShareWithList("kubestellar/console-kb", nil) {
		t.Error("expected empty allowlist to reject everything")
	}
}

func TestIsRepoAllowedForShareWithList_EmptyRepo(t *testing.T) {
	allowed := []string{"kubestellar/console-kb"}
	if isRepoAllowedForShareWithList("", allowed) {
		t.Error("expected empty repo string to be rejected")
	}
}

// ---------------------------------------------------------------------------
// resolveAllowedShareRepos
// ---------------------------------------------------------------------------

func TestResolveAllowedShareRepos_DefaultOnly(t *testing.T) {
	os.Unsetenv("KC_ALLOWED_SHARE_REPOS")
	repos := resolveAllowedShareRepos()
	if len(repos) == 0 {
		t.Fatal("expected at least one default repo")
	}
	found := false
	for _, r := range repos {
		if r == "kubestellar/console-kb" {
			found = true
		}
	}
	if !found {
		t.Error("expected kubestellar/console-kb in defaults")
	}
}

func TestResolveAllowedShareRepos_WithEnvExtension(t *testing.T) {
	t.Setenv("KC_ALLOWED_SHARE_REPOS", "org/extra-repo, org/another")
	repos := resolveAllowedShareRepos()
	found := map[string]bool{}
	for _, r := range repos {
		found[r] = true
	}
	if !found["org/extra-repo"] {
		t.Error("expected org/extra-repo from env var")
	}
	if !found["org/another"] {
		t.Error("expected org/another from env var")
	}
	if !found["kubestellar/console-kb"] {
		t.Error("expected default kubestellar/console-kb preserved")
	}
}

func TestResolveAllowedShareRepos_EnvEmptyEntries(t *testing.T) {
	t.Setenv("KC_ALLOWED_SHARE_REPOS", "org/repo, , ,  ")
	repos := resolveAllowedShareRepos()
	for _, r := range repos {
		if r == "" || r == " " {
			t.Errorf("expected empty entries to be filtered out, got %q", r)
		}
	}
}

// ---------------------------------------------------------------------------
// validateSlackWebhookURL
// ---------------------------------------------------------------------------

func TestValidateSlackWebhookURL_Valid(t *testing.T) {
	valid := []string{
		"https://hooks.slack.com/services/TTEST/BTEST/test",
		"https://hooks.slack.com/services/x/y/z",
	}
	for _, u := range valid {
		if err := validateSlackWebhookURL(u); err != nil {
			t.Errorf("validateSlackWebhookURL(%q) = %v, want nil", u, err)
		}
	}
}

func TestValidateSlackWebhookURL_EmptyURL(t *testing.T) {
	err := validateSlackWebhookURL("")
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
}

func TestValidateSlackWebhookURL_HTTPNotAllowed(t *testing.T) {
	err := validateSlackWebhookURL("http://hooks.slack.com/services/x/y/z")
	if err == nil {
		t.Fatal("expected error for http scheme")
	}
}

func TestValidateSlackWebhookURL_WrongHost(t *testing.T) {
	cases := []string{
		"https://evil.com/services/x/y/z",
		"https://hooks.slack.com.evil.com/services/x/y/z",
		"https://not-hooks.slack.com/services/x/y/z",
	}
	for _, u := range cases {
		if err := validateSlackWebhookURL(u); err == nil {
			t.Errorf("validateSlackWebhookURL(%q) should fail for wrong host", u)
		}
	}
}

func TestValidateSlackWebhookURL_UserInfo(t *testing.T) {
	err := validateSlackWebhookURL("https://user:pass@hooks.slack.com/services/x/y/z")
	if err == nil {
		t.Fatal("expected error for URL with userinfo")
	}
}

func TestValidateSlackWebhookURL_WithPort(t *testing.T) {
	err := validateSlackWebhookURL("https://hooks.slack.com:8443/services/x/y/z")
	if err == nil {
		t.Fatal("expected error for URL with port")
	}
}

func TestValidateSlackWebhookURL_WrongPath(t *testing.T) {
	cases := []string{
		"https://hooks.slack.com/api/chat.postMessage",
		"https://hooks.slack.com/other/x/y/z",
		"https://hooks.slack.com/",
	}
	for _, u := range cases {
		if err := validateSlackWebhookURL(u); err == nil {
			t.Errorf("validateSlackWebhookURL(%q) should fail for wrong path", u)
		}
	}
}

func TestValidateSlackWebhookURL_InvalidURL(t *testing.T) {
	err := validateSlackWebhookURL("://not-a-url")
	if err == nil {
		t.Fatal("expected error for malformed URL")
	}
}
