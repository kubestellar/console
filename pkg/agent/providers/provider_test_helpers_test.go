package providers

import (
	"os/exec"
	"strings"
	"testing"
)

// containsSubstring checks if s contains substr (test helper).
func containsSubstring(s, substr string) bool {
	return strings.Contains(s, substr)
}

func allowLoopbackProviderHostsForTest(t *testing.T) {
	t.Helper()

	previous := AllowLoopbackForTests
	AllowLoopbackForTests = true
	t.Cleanup(func() {
		AllowLoopbackForTests = previous
	})
}

func skipIfExecutableMissing(t *testing.T, executable string) {
	t.Helper()

	if _, err := exec.LookPath(executable); err != nil {
		t.Skipf("%s CLI not available in PATH", executable)
	}
}
