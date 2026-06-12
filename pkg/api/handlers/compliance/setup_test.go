package compliance

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers/testutil"
)

// setupTestEnv creates a test environment for compliance handler tests.
func setupTestEnv(t *testing.T) *testutil.TestEnv {
	t.Helper()
	return testutil.SetupTestEnv(t)
}
