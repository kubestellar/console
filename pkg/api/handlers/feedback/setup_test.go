package feedback

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubestellar/console/pkg/settings"
)

// RoundTripFunc is a helper for mocking http.Client Transport
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// TestMain resets the settings manager to a clean temp state for each test run
// so that system-level GitHub tokens (GITHUB_TOKEN, FEEDBACK_GITHUB_TOKEN) do
// not leak into unit tests and override per-test mock tokens.
func TestMain(m *testing.M) {
	// Isolate the settings manager so it does not read from a shared file.
	tempDir, err := os.MkdirTemp("", "feedback-test-settings-*")
	if err == nil {
		defer os.RemoveAll(tempDir)
		sm := settings.GetSettingsManager()
		sm.SetSettingsPath(filepath.Join(tempDir, "settings.json"))
		sm.SetKeyPath(filepath.Join(tempDir, ".keyfile"))
		_ = sm.Load()
	}

	// Suppress ambient GitHub tokens so per-test token values are used.
	// The original values are restored after all tests complete.
	origFeedback := os.Getenv("FEEDBACK_GITHUB_TOKEN")
	origGitHub := os.Getenv("GITHUB_TOKEN")
	_ = os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
	_ = os.Unsetenv("GITHUB_TOKEN")
	defer func() {
		if origFeedback != "" {
			_ = os.Setenv("FEEDBACK_GITHUB_TOKEN", origFeedback)
		}
		if origGitHub != "" {
			_ = os.Setenv("GITHUB_TOKEN", origGitHub)
		}
	}()

	os.Exit(m.Run())
}
