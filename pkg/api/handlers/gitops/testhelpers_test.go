package gitops

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/handlers"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
)

// setupTestEnv wraps the parent package's SetupTestEnv for gitops tests.
func setupTestEnv(t *testing.T) *handlers.TestEnv {
	return handlers.SetupTestEnv(t)
}

// injectDynamicCluster wraps the parent package's InjectDynamicCluster for gitops tests.
func injectDynamicCluster(env *handlers.TestEnv, clusterName string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	return handlers.InjectDynamicCluster(env, clusterName, gvrKinds)
}
