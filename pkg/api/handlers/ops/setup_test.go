package ops

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// testAdminUserID is the fixed user ID injected by setupTestEnv for
// RBAC-protected endpoints. The MockStore is configured to return an admin
// user for this ID.
var testAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// fiberTestTimeout is the maximum time (ms) Fiber's app.Test waits for a response.
const fiberTestTimeout = 5000

// RoundTripFunc is a helper for mocking http.Client Transport.
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// testEnv holds the minimal test environment the ops handlers need. Unlike
// the root handlers testEnv, ops handlers don't exercise most of the
// namespace/CRD/topology cluster resources, so only a Fiber app, a store,
// a k8s client, and a websocket hub are provided here (mirroring the pattern
// established by pkg/api/handlers/proxy/setup_test.go, epic #23685).
type testEnv struct {
	App       *fiber.App
	K8sClient *k8s.MultiClusterClient
	Hub       *transport.Hub
	Store     store.Store
}

// setupTestEnv creates a fresh test environment for an ops handler test.
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()

	tempDir := t.TempDir()

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
	k8sClient.InjectClient("test-cluster", k8sfake.NewSimpleClientset())
	k8sClient.SetRawConfig(rawConfig)

	hub := transport.NewHub()
	go hub.Run()
	t.Cleanup(func() {
		hub.Close()
	})

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", testAdminUserID).Return(&models.User{
		ID:   testAdminUserID,
		Role: "admin",
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testAdminUserID)
		return c.Next()
	})

	return &testEnv{
		App:       app,
		K8sClient: k8sClient,
		Hub:       hub,
		Store:     mockStore,
	}
}
