package feedback

import (
	"os"
	"testing"
)

func TestNewGitHubAppTokenProvider_MissingEnv(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()
	if p != nil {
		t.Errorf("expected nil provider when env vars missing, got %v", p)
	}
}

func TestNewGitHubAppTokenProvider_PartialEnv(t *testing.T) {
	cases := []struct {
		name           string
		appID          string
		installationID string
		privateKey     string
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
