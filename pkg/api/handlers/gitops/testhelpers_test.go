package gitops

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers/testutil"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
)

// fiberTestTimeout is the default timeout (ms) for fiber app.Test() calls.
const fiberTestTimeout = testutil.FiberTestTimeout

// setupTestEnv creates a shared test environment for gitops package tests.
func setupTestEnv(t *testing.T) *testutil.TestEnv {
	return testutil.SetupTestEnv(t)
}

// injectDynamicCluster injects a fake dynamic client for the given cluster.
func injectDynamicCluster(env *testutil.TestEnv, clusterName string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	return testutil.InjectDynamicCluster(env, clusterName, gvrKinds)
}
