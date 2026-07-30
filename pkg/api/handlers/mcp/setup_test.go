package mcp

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/mock"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// testAdminUserID is the fixed user ID injected by setupTestEnv for RBAC-protected
// endpoints. The MockStore is configured to return an admin user for this ID.
var testAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// RoundTripFunc is a helper for mocking http.Client Transport
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// testEnv holds the test environment components.
type testEnv struct {
	App       *fiber.App
	TempDir   string
	Settings  *settings.SettingsManager
	K8sClient *k8s.MultiClusterClient
	Hub       *transport.Hub
	Store     store.Store
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

	// Initialize K8s Client with an isolated kubeconfig file so tests can inject
	// fake cluster clients without tripping ErrNoClusterConfigured.
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
	// Inject a fake client for a "test-cluster" context
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("test-cluster", fakeClient)

	// Set a minimal rawConfig so ListClusters / HealthyClusters can discover
	// injected clusters (without this, LoadConfig fails → 500 in handlers).
	k8sClient.SetRawConfig(rawConfig)

	// Initialize Hub
	hub := transport.NewHub()

	// Initialize MockStore
	mockStore := new(test.MockStore)
	mockStore.On("GetUserByID", mock.Anything, testAdminUserID).Return(&models.User{
		ID:   testAdminUserID,
		Role: "admin",
	}, nil)
	mockStore.On("GetUser", mock.AnythingOfType("uuid.UUID")).Return(&models.User{
		ID:   testAdminUserID,
		Role: "admin",
	}, nil)

	// Initialize app
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
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
