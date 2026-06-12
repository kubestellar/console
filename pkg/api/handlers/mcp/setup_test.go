package mcp

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/testutil"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
)

// RoundTripFunc is a helper for mocking http.Client Transport in tests.
type RoundTripFunc = testutil.RoundTripFunc

// setupTestEnv creates a shared test environment for mcp package tests.
func setupTestEnv(t *testing.T) *testutil.TestEnv {
	return testutil.SetupTestEnv(t)
}

// testEnv is a local alias for testutil.TestEnv for backward compatibility.
type testEnv = testutil.TestEnv

// addClusterToRawConfig exposes testutil.AddClusterToRawConfig for mcp tests.
func addClusterToRawConfig(client *k8s.MultiClusterClient, cluster string) {
	testutil.AddClusterToRawConfig(client, cluster)
}

// clearSSECache delegates to handlers.ClearSSECache for mcp tests.
// Named ClearSSECache to match the call site in k8s_lifecycle_integration_test.go.
var ClearSSECache = handlers.ClearSSECache

// newK8sScheme creates a k8s runtime scheme for mcp tests.
func newK8sScheme() *runtime.Scheme {
	return testutil.NewK8sScheme()
}

// injectDynamicClusterWithObjects injects a fake dynamic client seeded with typed objects.
func injectDynamicClusterWithObjects(
	env *testutil.TestEnv,
	cluster string,
	scheme *runtime.Scheme,
	dynamicObjects []runtime.Object,
	typedObjects ...runtime.Object,
) *fake.FakeDynamicClient {
	return testutil.InjectDynamicClusterWithObjects(env, cluster, scheme, dynamicObjects, typedObjects...)
}

// sseTestTimeoutMs is the timeout (ms) for SSE handler tests.
const sseTestTimeoutMs = 15_000
