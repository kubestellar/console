package api

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
	teststore "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/require"
)

func TestSetupMCPRoutes_RegistersExpectedRoutes(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	k8sClient := &k8s.MultiClusterClient{}
	
	server := &Server{
		app:       app,
		store:     mockStore,
		k8sClient: k8sClient,
	}

	api := app.Group("/api")
	namespaces := handlers.NewNamespaceHandler(mockStore, k8sClient)
	server.setupMCPRoutes(api, namespaces)

	routes := routeTable(app)

	expectedRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/mcp/status"},
		{"GET", "/api/mcp/tools/ops"},
		{"GET", "/api/mcp/tools/deploy"},
		{"GET", "/api/mcp/clusters/:cluster/health"},
		{"GET", "/api/mcp/pods"},
		{"GET", "/api/mcp/pod-issues"},
		{"GET", "/api/mcp/deployment-issues"},
		{"GET", "/api/mcp/deployments"},
		{"GET", "/api/mcp/gpu-nodes"},
		{"GET", "/api/mcp/gpu-nodes/health"},
		{"GET", "/api/mcp/gpu-nodes/health/cronjob"},
		{"GET", "/api/mcp/gpu-nodes/health/cronjob/results"},
		{"GET", "/api/mcp/nvidia-operators"},
		{"GET", "/api/mcp/nodes"},
		{"GET", "/api/mcp/flatcar/nodes"},
		{"GET", "/api/mcp/events"},
		{"GET", "/api/mcp/events/warnings"},
		{"GET", "/api/mcp/security-issues"},
		{"GET", "/api/mcp/services"},
		{"GET", "/api/mcp/jobs"},
		{"GET", "/api/mcp/hpas"},
		{"GET", "/api/mcp/configmaps"},
		{"GET", "/api/mcp/secrets"},
		{"GET", "/api/mcp/serviceaccounts"},
		{"GET", "/api/mcp/pvcs"},
		{"GET", "/api/mcp/pvs"},
		{"GET", "/api/mcp/resourcequotas"},
		{"POST", "/api/mcp/resourcequotas"},
		{"DELETE", "/api/mcp/resourcequotas"},
		{"GET", "/api/mcp/limitranges"},
		{"GET", "/api/mcp/pods/logs"},
		{"POST", "/api/mcp/tools/ops/call"},
		{"POST", "/api/mcp/tools/deploy/call"},
		{"GET", "/api/mcp/wasmcloud/hosts"},
		{"GET", "/api/mcp/wasmcloud/actors"},
		{"GET", "/api/mcp/custom-resources"},
		{"GET", "/api/mcp/replicasets"},
		{"GET", "/api/mcp/statefulsets"},
		{"GET", "/api/mcp/daemonsets"},
		{"GET", "/api/mcp/cronjobs"},
		{"GET", "/api/mcp/ingresses"},
		{"GET", "/api/mcp/networkpolicies"},
		{"GET", "/api/mcp/pod-network-stats"},
		{"GET", "/api/mcp/resource-yaml"},
	}

	for _, tc := range expectedRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected route %s to be registered", key)
	}
}

func TestSetupMCPRoutes_RegistersDrasiProxy(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	k8sClient := &k8s.MultiClusterClient{}
	
	server := &Server{
		app:       app,
		store:     mockStore,
		k8sClient: k8sClient,
	}

	api := app.Group("/api")
	namespaces := handlers.NewNamespaceHandler(mockStore, k8sClient)
	server.setupMCPRoutes(api, namespaces)

	routes := routeTable(app)

	drasiProxyRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/drasi/proxy/*"},
		{"HEAD", "/api/drasi/proxy/*"},
		{"POST", "/api/drasi/proxy/*"},
		{"PUT", "/api/drasi/proxy/*"},
		{"PATCH", "/api/drasi/proxy/*"},
		{"DELETE", "/api/drasi/proxy/*"},
		{"CONNECT", "/api/drasi/proxy/*"},
		{"OPTIONS", "/api/drasi/proxy/*"},
		{"TRACE", "/api/drasi/proxy/*"},
	}

	for _, tc := range drasiProxyRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected drasi proxy route %s to be registered", key)
	}
}

func TestSetupMCPRoutes_RegistersWidgetAliases(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	k8sClient := &k8s.MultiClusterClient{}
	
	server := &Server{
		app:       app,
		store:     mockStore,
		k8sClient: k8sClient,
	}

	api := app.Group("/api")
	namespaces := handlers.NewNamespaceHandler(mockStore, k8sClient)
	server.setupMCPRoutes(api, namespaces)

	routes := routeTable(app)

	widgetAliases := []struct {
		method string
		path   string
	}{
		{"GET", "/api/mcp/workloads"},
		{"GET", "/api/mcp/security"},
		{"GET", "/api/mcp/storage"},
		{"GET", "/api/mcp/network"},
		{"GET", "/api/mcp/namespaces"},
		{"GET", "/api/mcp/namespaces/overview"},
		{"GET", "/api/alerts"},
		{"GET", "/api/mcp/costs"},
		{"GET", "/api/providers/health"},
	}

	for _, tc := range widgetAliases {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected widget alias route %s to be registered", key)
	}
}

func TestSetupMCPRoutes_RegistersSSEStreamingVariants(t *testing.T) {
	app := fiber.New()
	mockStore := &teststore.MockStore{}
	k8sClient := &k8s.MultiClusterClient{}
	
	server := &Server{
		app:       app,
		store:     mockStore,
		k8sClient: k8sClient,
	}

	api := app.Group("/api")
	namespaces := handlers.NewNamespaceHandler(mockStore, k8sClient)
	server.setupMCPRoutes(api, namespaces)

	routes := routeTable(app)

	streamingRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/mcp/pods/stream"},
		{"GET", "/api/mcp/pod-issues/stream"},
		{"GET", "/api/mcp/deployment-issues/stream"},
		{"GET", "/api/mcp/deployments/stream"},
		{"GET", "/api/mcp/events/stream"},
		{"GET", "/api/mcp/services/stream"},
		{"GET", "/api/mcp/security-issues/stream"},
		{"GET", "/api/mcp/nodes/stream"},
		{"GET", "/api/mcp/gpu-nodes/stream"},
		{"GET", "/api/mcp/gpu-nodes/health/stream"},
		{"GET", "/api/mcp/events/warnings/stream"},
		{"GET", "/api/mcp/jobs/stream"},
		{"GET", "/api/mcp/configmaps/stream"},
		{"GET", "/api/mcp/secrets/stream"},
		{"GET", "/api/mcp/nvidia-operators/stream"},
		{"GET", "/api/mcp/workloads/stream"},
	}

	for _, tc := range streamingRoutes {
		key := tc.method + " " + tc.path
		_, ok := routes[key]
		require.Truef(t, ok, "expected SSE streaming route %s to be registered", key)
	}
}
