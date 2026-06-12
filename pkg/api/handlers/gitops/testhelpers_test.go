package gitops

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers/testutil"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
)

// fiberTestTimeout is the default timeout (ms) for fiber app.Test() calls in gitops tests.
const fiberTestTimeout = testutil.FiberTestTimeout

// setupTestEnv creates a test environment for gitops handler tests.
func setupTestEnv(t *testing.T) *testutil.TestEnv {
	t.Helper()
	return testutil.SetupTestEnv(t)
}

// injectDynamicCluster injects a fake dynamic cluster into the test environment.
func injectDynamicCluster(env *testutil.TestEnv, clusterName string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	return testutil.InjectDynamicCluster(env, clusterName, gvrKinds)
}
