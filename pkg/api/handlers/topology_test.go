package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestTopologyGetTopology_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewTopologyHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/topology", handler.GetTopology)

	// Inject dynamic objects for MCS and Gateway API
	gvrKinds := map[schema.GroupVersionResource]string{
		{Group: "multicluster.x-k8s.io", Version: "v1alpha1", Resource: "serviceexports"}: "ServiceExportList",
		{Group: "multicluster.x-k8s.io", Version: "v1alpha1", Resource: "serviceimports"}: "ServiceImportList",
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}:          "GatewayList",
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}:        "HTTPRouteList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)

	// Add a ServiceExport
	se := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "test-svc",
				"namespace": "default",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   string(v1alpha1.ServiceExportStatusReady),
						"status": "True",
					},
				},
			},
		},
	}
	_, err := dynClient.Resource(gvrKindsToGVR(t, gvrKinds, "ServiceExportList")).Namespace("default").Create(context.Background(), se, metav1.CreateOptions{})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodGet, "/api/topology", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	graph := result["graph"].(map[string]interface{})
	nodes := graph["nodes"].([]interface{})

	// Verify graph contains the service and cluster nodes
	foundService := false
	foundCluster := false
	for _, n := range nodes {
		node := n.(map[string]interface{})
		if node["type"] == "service" && node["label"] == "test-svc" {
			foundService = true
			assert.Equal(t, "default", node["namespace"])
			assert.Equal(t, "test-cluster", node["cluster"])
			meta, ok := node["metadata"].(map[string]interface{})
			require.True(t, ok, "service node must have a metadata map")
			assert.Equal(t, "test-svc", meta["serviceName"], "metadata.serviceName must match the service name")
			assert.Equal(t, true, meta["exported"])
		}
		if node["type"] == "cluster" && node["label"] == "test-cluster" {
			foundCluster = true
		}
	}
	assert.True(t, foundService, "Service node should be present")
	assert.True(t, foundCluster, "Cluster node should be present")
}

func TestTopologyGetTopology_NoClusters(t *testing.T) {
	env := setupTestEnv(t)
	// Clear clusters
	env.K8sClient.SetRawConfig(&k8sapi.Config{})
	
	handler := NewTopologyHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/topology", handler.GetTopology)

	req, err := http.NewRequest(http.MethodGet, "/api/topology", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	graph := result["graph"].(map[string]interface{})
	assert.Empty(t, graph["nodes"])
}

