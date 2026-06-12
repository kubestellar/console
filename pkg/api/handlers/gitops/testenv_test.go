package gitops

import (
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// fiberTestTimeout is the timeout in milliseconds passed to fiber.App.Test.
const fiberTestTimeout = 5000

type testEnv struct {
	App       *fiber.App
	TempDir   string
	Settings  *settings.SettingsManager
	K8sClient *k8s.MultiClusterClient
	Store     store.Store
}

// setupTestEnv creates a test environment for the gitops package tests.
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "settings.json")
	keyPath := filepath.Join(tempDir, ".keyfile")

	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(settingsPath)
	manager.SetKeyPath(keyPath)
	_ = manager.Load()

	rawConfig := &api.Config{
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://test-cluster:6443"},
		},
		Contexts: map[string]*api.Context{
			"test-cluster": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"test-user": {},
		},
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
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("test-cluster", fakeClient)
	k8sClient.SetRawConfig(rawConfig)

	mockStore := new(test.MockStore)

	app := fiber.New()

	return &testEnv{
		App:       app,
		TempDir:   tempDir,
		Settings:  manager,
		K8sClient: k8sClient,
		Store:     mockStore,
	}
}

// injectDynamicCluster creates a fake dynamic client and injects it into the
// test environment for the given cluster name.
func injectDynamicCluster(env *testEnv, cluster string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrKinds)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset())
	addClusterToRawConfig(env.K8sClient, cluster)
	return dynClient
}

// addClusterToRawConfig ensures a cluster appears in the rawConfig so
// ListClusters / HealthyClusters can discover it during tests.
func addClusterToRawConfig(client *k8s.MultiClusterClient, cluster string) {
	cfg := client.GetRawConfig()
	if cfg == nil {
		cfg = &api.Config{
			Clusters: map[string]*api.Cluster{},
			Contexts: map[string]*api.Context{},
		}
	}
	if cfg.Clusters == nil {
		cfg.Clusters = map[string]*api.Cluster{}
	}
	if cfg.Contexts == nil {
		cfg.Contexts = map[string]*api.Context{}
	}
	cfg.Clusters[cluster] = &api.Cluster{Server: "https://" + cluster + ":6443"}
	cfg.Contexts[cluster] = &api.Context{Cluster: cluster, AuthInfo: "test-user"}
	client.SetRawConfig(cfg)
}
