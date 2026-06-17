package feedback

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/kubestellar/console/pkg/settings"
)

// RoundTripFunc is a helper for mocking http.Client Transport
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// resetFeedbackSettings points the settings manager at a fresh temporary
// directory AND clears GitHub token env vars, so that any ambient GITHUB_TOKEN
// (e.g., from the CI environment) does not leak into tests that rely on the
// handler's own token fields.
func resetFeedbackSettings(t *testing.T) {
	t.Helper()
	tempDir := t.TempDir()
	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(filepath.Join(tempDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(tempDir, ".keyfile"))
	_ = manager.Load()
	// t.Setenv automatically restores the original value when the test ends.
	t.Setenv("GITHUB_TOKEN", "")
	t.Setenv("FEEDBACK_GITHUB_TOKEN", "")
}
