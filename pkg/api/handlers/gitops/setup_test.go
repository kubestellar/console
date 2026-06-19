package gitops

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	handlerspkg "github.com/kubestellar/console/pkg/api/handlers"
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
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

var testAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
const fiberTestTimeout = 5000

type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

type testEnv struct {
	App       *fiber.App
	TempDir   string
	Settings  *settings.SettingsManager
	K8sClient *k8s.MultiClusterClient
	Hub       *handlerspkg.Hub
	Store     store.Store
}

func setupTestEnv(t *testing.T) *testEnv {
	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "settings.json")
	keyPath := filepath.Join(tempDir, ".keyfile")

	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(settingsPath)
	manager.SetKeyPath(keyPath)
	_ = manager.Load()

	rawConfig := &clientcmdapi.Config{
		Clusters: map[string]*clientcmdapi.Cluster{
			"test-cluster": {Server: "https://test-cluster:6443"},
		},
		Contexts: map[string]*clientcmdapi.Context{
			"test-cluster": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{
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
	k8sClient.InjectClient("test-cluster", k8sfake.NewSimpleClientset())
	k8sClient.SetRawConfig(rawConfig)

	hub := handlerspkg.NewHub()
	go hub.Run()
	t.Cleanup(func() {
		hub.Close()
	})

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", testAdminUserID).Return(&models.User{
		ID:   testAdminUserID,
		Role: "admin",
	}, nil).Maybe()
	mockStore.On("SaveClusterGroup", mock.Anything, mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("DeleteClusterGroup", mock.Anything, mock.Anything).Return(nil).Maybe()
	mockStore.On("ListClusterGroups", mock.Anything).Return(map[string][]byte{}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testAdminUserID)
		return c.Next()
	})

	return &testEnv{
		App:       app,
		TempDir:   tempDir,
		Settings:  manager,
		K8sClient: k8sClient,
		Hub:       hub,
		Store:     mockStore,
	}
}

func injectDynamicCluster(env *testEnv, cluster string, gvrKinds map[schema.GroupVersionResource]string) *fake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrKinds)
	env.K8sClient.InjectDynamicClient(cluster, dynClient)
	env.K8sClient.InjectClient(cluster, k8sfake.NewSimpleClientset())
	addClusterToRawConfig(env.K8sClient, cluster)
	return dynClient
}

func addClusterToRawConfig(client *k8s.MultiClusterClient, cluster string) {
	cfg := client.GetRawConfig()
	if cfg == nil {
		cfg = &clientcmdapi.Config{
			Clusters: map[string]*clientcmdapi.Cluster{},
			Contexts: map[string]*clientcmdapi.Context{},
		}
	}
	if cfg.Clusters == nil {
		cfg.Clusters = map[string]*clientcmdapi.Cluster{}
	}
	if cfg.Contexts == nil {
		cfg.Contexts = map[string]*clientcmdapi.Context{}
	}
	cfg.Clusters[cluster] = &clientcmdapi.Cluster{Server: "https://" + cluster + ":6443"}
	cfg.Contexts[cluster] = &clientcmdapi.Context{Cluster: cluster, AuthInfo: "test-user"}
	client.SetRawConfig(cfg)
}
