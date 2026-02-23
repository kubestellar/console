package handlers

import (
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/settings"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

type testEnv struct {
	App       *fiber.App
	TempDir   string
	Settings  *settings.SettingsManager
	K8sClient *k8s.MultiClusterClient
	Hub       *Hub
}

// setupTestEnv creates a new test environment with a fresh Fiber app and an initialized
// SettingsManager pointing to a temporary directory.
func setupTestEnv(t *testing.T) *testEnv {
	// Create a temporary directory for settings
	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "settings.json")
	keyPath := filepath.Join(tempDir, ".keyfile")

	// Initialize SettingsManager
	manager := settings.GetSettingsManager()
	// Override paths for testing isolation
	manager.SetSettingsPath(settingsPath)
	manager.SetKeyPath(keyPath)

	// Ensure we start with a clean state for this test run relative to the file.
	_ = manager.Load()

	// Initialize K8s Client with a fake cluster
	k8sClient, _ := k8s.NewMultiClusterClient("")
	// Inject a fake client for a "test-cluster" context
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("test-cluster", fakeClient)

	// Set a minimal rawConfig so ListClusters / HealthyClusters can discover
	// injected clusters (without this, LoadConfig fails → 500 in handlers).
	k8sClient.SetRawConfig(&api.Config{
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://test-cluster:6443"},
		},
		Contexts: map[string]*api.Context{
			"test-cluster": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		CurrentContext: "test-cluster",
	})

	// Initialize Hub
	hub := NewHub()
	go hub.Run() // Start hub loop (in background)
	t.Cleanup(func() {
		hub.Close()
	})

	app := fiber.New()

	// Return the environment
	return &testEnv{
		App:       app,
		TempDir:   tempDir,
		Settings:  manager,
		K8sClient: k8sClient,
		Hub:       hub,
	}
}

// injectDynamicCluster creates a fake dynamic client with custom list kinds (for CRD resources
// like Gateway, HTTPRoute, ServiceExport, etc.) and injects both dynamic and typed clients
// into the test environment for the given cluster name.
//
// gvrKinds maps each GVR to its list kind string (e.g. "GatewayList").
// Returns the dynamic client for reactor registration.
func injectDynamicCluster(env *testEnv, cluster string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrKinds)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset())
	// Ensure the cluster is discoverable via ListClusters / HealthyClusters.
	addClusterToRawConfig(env.K8sClient, cluster)
	return dynClient
}

// injectDynamicClusterWithObjects creates a fake dynamic client seeded with typed K8s objects
// (Deployments, Pods, Services, etc.) and injects both dynamic and typed clients into the test
// environment for the given cluster name.
//
// The scheme must have the relevant types registered (e.g. via k8sscheme.AddToScheme).
// typedObjects are optional typed K8s objects to seed into the typed client.
// Returns the dynamic client for further reactor registration if needed.
func injectDynamicClusterWithObjects(
	env *testEnv,
	cluster string,
	scheme *runtime.Scheme,
	dynamicObjects []runtime.Object,
	typedObjects ...runtime.Object,
) *fake.FakeDynamicClient {
	dynClient := fake.NewSimpleDynamicClient(scheme, dynamicObjects...)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset(typedObjects...))
	// Ensure the cluster is discoverable via ListClusters / HealthyClusters.
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
