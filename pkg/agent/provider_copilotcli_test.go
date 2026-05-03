package agent

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestCopilotCLIProvider_Basics(t *testing.T) {
	p := &CopilotCLIProvider{}

	if p.Name() != "copilot-cli" {
		t.Errorf("Expected 'copilot-cli', got %q", p.Name())
	}
	if p.DisplayName() != "Copilot CLI" {
		t.Errorf("Expected 'Copilot CLI', got %q", p.DisplayName())
	}
	if p.Provider() != "github-cli" {
		t.Errorf("Expected 'github-cli', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestCopilotCLIProvider_NotInstalled(t *testing.T) {
	p := &CopilotCLIProvider{} // No cliPath set

	if p.IsAvailable() {
		t.Error("Expected IsAvailable=false when CLI is not installed")
	}
	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
	if p.Capabilities()&CapabilityToolExec == 0 {
		t.Error("Expected CapabilityToolExec to be set")
	}
}

func TestCopilotCLIProvider_ChatNotInstalled(t *testing.T) {
	p := &CopilotCLIProvider{} // No cliPath set

	_, err := p.Chat(t.Context(), &ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Error("Expected error when CLI is not installed")
	}
}

func TestCopilotCLIProvider_DescriptionWithVersion(t *testing.T) {
	p := &CopilotCLIProvider{version: "0.0.418"}
	desc := p.Description()
	if !containsSubstring(desc, "0.0.418") {
		t.Errorf("Description should contain version, got %q", desc)
	}
}

func TestCopilotCLIProvider_Interface(t *testing.T) {
	var _ AIProvider = &CopilotCLIProvider{}
}

func TestIsAuthError(t *testing.T) {
	cases := []struct {
		text string
		want bool
	}{
		{"copilot CLI requires authentication", true},
		{"please login first", true},
		{"token has expired", true},
		{"HTTP 401 Unauthorized", true},
		{"HTTP 403 Forbidden", true},
		{"sign in to continue", true},
		{"rate limit exceeded", false},
		{"network timeout", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isAuthError(tc.text); got != tc.want {
			t.Errorf("isAuthError(%q) = %v, want %v", tc.text, got, tc.want)
		}
	}
}

func TestFreshEnv_StripsStaleTokens(t *testing.T) {
	t.Setenv("GH_TOKEN", "stale-gh-token")
	t.Setenv("GITHUB_TOKEN", "stale-github-token")

	env := freshEnv()

	for _, e := range env {
		upper := strings.ToUpper(e)
		if strings.HasPrefix(upper, "GH_TOKEN=") {
			t.Error("freshEnv should strip GH_TOKEN")
		}
		if strings.HasPrefix(upper, "GITHUB_TOKEN=") {
			t.Error("freshEnv should strip GITHUB_TOKEN")
		}
	}

	found := false
	for _, e := range env {
		if e == "NO_COLOR=1" {
			found = true
			break
		}
	}
	if !found {
		t.Error("freshEnv should include NO_COLOR=1")
	}
}

func TestFreshEnv_PreservesOtherVars(t *testing.T) {
	t.Setenv("MY_CUSTOM_VAR", "keepme")

	env := freshEnv()
	found := false
	for _, e := range env {
		if e == "MY_CUSTOM_VAR=keepme" {
			found = true
			break
		}
	}
	if !found {
		t.Error("freshEnv should preserve non-token env vars")
	}
}

func TestRefreshGitHubAuth_Cooldown(t *testing.T) {
	p := &CopilotCLIProvider{}

	// Force a recent refresh so the cooldown prevents another attempt.
	p.authMu.Lock()
	p.lastAuthRefresh = time.Now()
	p.lastAuthRefreshOK = true
	p.authMu.Unlock()

	// Should return cached result without invoking gh.
	got := p.refreshGitHubAuth()
	if !got {
		t.Error("Expected cached true from cooldown period")
	}

	// With lastAuthRefreshOK=false, cooldown should return false.
	p.authMu.Lock()
	p.lastAuthRefreshOK = false
	p.lastAuthRefresh = time.Now()
	p.authMu.Unlock()

	got = p.refreshGitHubAuth()
	if got {
		t.Error("Expected cached false from cooldown period")
	}
}

func TestRefreshGitHubAuth_GhNotInstalled(t *testing.T) {
	p := &CopilotCLIProvider{}

	// Ensure cooldown is expired so it actually runs gh.
	p.authMu.Lock()
	p.lastAuthRefresh = time.Time{}
	p.authMu.Unlock()

	origPath := os.Getenv("PATH")
	t.Setenv("PATH", "/nonexistent")
	defer os.Setenv("PATH", origPath)

	got := p.refreshGitHubAuth()
	if got {
		t.Error("Expected false when gh is not on PATH")
	}
}
