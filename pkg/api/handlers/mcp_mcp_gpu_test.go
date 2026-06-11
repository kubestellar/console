package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"context"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestMCPGetGPUNodes_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/nodes", handler.GetGPUNodes)

	// Seed "test-cluster" with a GPU node
	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)
	fakeClient := k8sClient.(*k8sfake.Clientset)

	gpuNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "gpu-node-1",
			Labels: map[string]string{
				"nvidia.com/gpu.product": "Tesla T4",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("1"),
			},
		},
	}
	_, err = fakeClient.CoreV1().Nodes().Create(context.Background(), gpuNode, metav1.CreateOptions{})
	require.NoError(t, err)

	req, err := http.NewRequest("GET", "/api/mcp/gpu/nodes?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	nodes, ok := payload["nodes"].([]interface{})
	require.True(t, ok)
	assert.Len(t, nodes, 1)
	
	node0 := nodes[0].(map[string]interface{})
	assert.Equal(t, "gpu-node-1", node0["name"])
	assert.Equal(t, "Tesla T4", node0["gpuType"])
	assert.Equal(t, float64(1), node0["gpuCount"])
}

func TestMCPGetGPUNodeHealth_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/health", handler.GetGPUNodeHealth)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)
	fakeClient := k8sClient.(*k8sfake.Clientset)

	// Seed a healthy GPU node
	gpuNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "healthy-gpu-node",
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("1"),
			},
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
		},
	}
	_, err = fakeClient.CoreV1().Nodes().Create(context.Background(), gpuNode, metav1.CreateOptions{})
	require.NoError(t, err)

	req, err := http.NewRequest("GET", "/api/mcp/gpu/health?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	nodes, ok := payload["nodes"].([]interface{})
	require.True(t, ok)
	assert.Len(t, nodes, 1)
	
	node0 := nodes[0].(map[string]interface{})
	assert.Equal(t, "healthy-gpu-node", node0["nodeName"])
	assert.Equal(t, "healthy", node0["status"])
}

func TestMCPGetGPUHealthCronJobStatus_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/cronjob/status", handler.GetGPUHealthCronJobStatus)

	req, err := http.NewRequest("GET", "/api/mcp/gpu/cronjob/status?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	status, ok := payload["status"].(map[string]interface{})
	require.True(t, ok)
	assert.False(t, status["installed"].(bool))
}

func TestMCPGetNVIDIAOperatorStatus_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/operators", handler.GetNVIDIAOperatorStatus)

	req, err := http.NewRequest("GET", "/api/mcp/gpu/operators", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "demo", payload["source"])
	assert.NotEmpty(t, payload["operators"])
}

func TestMCPGetGPUHealthCronJobResults_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/cronjob/results", handler.GetGPUHealthCronJobResults)

	// Seed fake resources
	mockResults := []k8s.GPUHealthCheckResult{
		{NodeName: "node-1", Status: "healthy"},
	}
	resultsJSON, _ := json.Marshal(map[string]interface{}{"nodes": mockResults})
	client, _ := env.K8sClient.GetClient("test-cluster")
	fakeClient := client.(*k8sfake.Clientset)

	fakeClient.CoreV1().ConfigMaps("nvidia-gpu-operator").Create(context.Background(), &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-health-results", Namespace: "nvidia-gpu-operator"},
		Data:       map[string]string{"results": string(resultsJSON)},
	}, metav1.CreateOptions{})

	fakeClient.BatchV1().CronJobs("nvidia-gpu-operator").Create(context.Background(), &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-health-check", Namespace: "nvidia-gpu-operator"},
		Spec:       batchv1.CronJobSpec{Schedule: "*/5 * * * *"},
	}, metav1.CreateOptions{})

	req, err := http.NewRequest("GET", "/api/mcp/gpu/cronjob/results?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "test-cluster", payload["cluster"])
	assert.NotNil(t, payload["results"])
	results := payload["results"].([]interface{})
	assert.Len(t, results, 1)
}

func TestMCPGetGPUNodes_AllClusters(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/gpu/nodes", handler.GetGPUNodes)

	// HealthyClusters should return our test-cluster
	req, err := http.NewRequest("GET", "/api/mcp/gpu/nodes", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 10000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	assert.NotNil(t, payload["nodes"])
}
