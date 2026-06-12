// Package testutil provides shared test infrastructure for handler sub-packages.
// It is a regular (non-test) package so that test files in child packages such as
// handlers/compliance, handlers/github, handlers/gitops, and handlers/mcp can
// import it directly. It intentionally exports only testing-support types and helpers.
package testutil

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/mock"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8sscheme "k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/clientcmd"
	k8sapi "k8s.io/client-go/tools/clientcmd/api"
)

// FiberTestTimeout is the default timeout (ms) for fiber app.Test() calls.
const FiberTestTimeout = 5000

// TestAdminUserID is the fixed user ID injected by SetupTestEnv for
// RBAC-protected endpoints.
var TestAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// RoundTripFunc is a helper for mocking http.Client Transport in tests.
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// TestEnv holds the test environment components shared by handler tests.
type TestEnv struct {
	App       *fiber.App
	TempDir   string
	Settings  *settings.SettingsManager
	K8sClient *k8s.MultiClusterClient
	Store     store.Store
}

// SetupTestEnv creates a new test environment with a fresh Fiber app,
// an initialized SettingsManager, and a MockStore pre-configured with an
// admin user so RBAC-protected endpoints pass without extra setup.
func SetupTestEnv(t *testing.T) *TestEnv {
	t.Helper()
	tempDir := t.TempDir()

	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(filepath.Join(tempDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(tempDir, ".keyfile"))
	_ = manager.Load()

	rawConfig := &k8sapi.Config{
		Clusters:  map[string]*k8sapi.Cluster{"test-cluster": {Server: "https://test-cluster:6443"}},
		Contexts:  map[string]*k8sapi.Context{"test-cluster": {Cluster: "test-cluster", AuthInfo: "test-user"}},
		AuthInfos: map[string]*k8sapi.AuthInfo{"test-user": {}},
		CurrentContext: "test-cluster",
	}
	kubeconfigPath := filepath.Join(tempDir, "kubeconfig")
	if err := clientcmd.WriteToFile(*rawConfig, kubeconfigPath); err != nil {
		t.Fatalf("write test kubeconfig: %v", err)
	}
	k8sClient, err := k8s.NewMultiClusterClient(kubeconfigPath)
	if err != nil {
		t.Fatalf("create test k8s client: %v", err)
	}
	k8sClient.InjectClient("test-cluster", k8sfake.NewSimpleClientset())
	k8sClient.SetRawConfig(rawConfig)

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", TestAdminUserID).Return(&models.User{
		ID:   TestAdminUserID,
		Role: "admin",
	}, nil).Maybe()
	mockStore.On("SaveClusterGroup", mock.Anything, mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("DeleteClusterGroup", mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", TestAdminUserID)
		return c.Next()
	})

	return &TestEnv{
		App:       app,
		TempDir:   tempDir,
		Settings:  manager,
		K8sClient: k8sClient,
		Store:     mockStore,
	}
}

// InjectDynamicCluster creates a fake dynamic client with custom list kinds
// and injects both dynamic and typed clients into the test environment.
func InjectDynamicCluster(env *TestEnv, cluster string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrKinds)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset())
	AddClusterToRawConfig(env.K8sClient, cluster)
	return dynClient
}

// AddClusterToRawConfig ensures a cluster appears in the raw kubeconfig so
// ListClusters / HealthyClusters can discover it during tests.
func AddClusterToRawConfig(client *k8s.MultiClusterClient, cluster string) {
	cfg := client.GetRawConfig()
	if cfg == nil {
		cfg = &k8sapi.Config{
			Clusters: map[string]*k8sapi.Cluster{},
			Contexts: map[string]*k8sapi.Context{},
		}
	}
	if cfg.Clusters == nil {
		cfg.Clusters = map[string]*k8sapi.Cluster{}
	}
	if cfg.Contexts == nil {
		cfg.Contexts = map[string]*k8sapi.Context{}
	}
	cfg.Clusters[cluster] = &k8sapi.Cluster{Server: "https://" + cluster + ":6443"}
	cfg.Contexts[cluster] = &k8sapi.Context{Cluster: cluster, AuthInfo: "test-user"}
	client.SetRawConfig(cfg)
}

// NewK8sScheme creates a new runtime.Scheme with the standard k8s types registered.
func NewK8sScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = k8sscheme.AddToScheme(scheme)
	return scheme
}

// InjectDynamicClusterWithObjects creates a fake dynamic client seeded with
// typed K8s objects and injects both dynamic and typed clients into the env.
func InjectDynamicClusterWithObjects(
	env *TestEnv,
	cluster string,
	scheme *runtime.Scheme,
	dynamicObjects []runtime.Object,
	typedObjects ...runtime.Object,
) *fake.FakeDynamicClient {
	dynClient := fake.NewSimpleDynamicClient(scheme, dynamicObjects...)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset(typedObjects...))
	AddClusterToRawConfig(env.K8sClient, cluster)
	return dynClient
}
