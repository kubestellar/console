package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestLimaList_DemoModeReturnsDemoData(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewLimaHandlers(env.K8sClient)
	env.App.Get("/api/lima", handler.ListLima)

	req, err := http.NewRequest(http.MethodGet, "/api/lima", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload LimaListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.True(t, payload.IsDemoData)
	assert.NotEmpty(t, payload.LimaInstances)
}

func TestLimaList_NoClientReturns503DemoFallback(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewLimaHandlers(nil)
	env.App.Get("/api/lima", handler.ListLima)

	req, err := http.NewRequest(http.MethodGet, "/api/lima", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload LimaListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.True(t, payload.IsDemoData)
	assert.Len(t, payload.LimaInstances, 0)
}

func TestLimaList_ReachableClusterNoLimaReturns200LiveEmpty(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewLimaHandlers(env.K8sClient)
	env.App.Get("/api/lima", handler.ListLima)

	req, err := http.NewRequest(http.MethodGet, "/api/lima", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload LimaListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.False(t, payload.IsDemoData)
	assert.Len(t, payload.LimaInstances, 0)
}

func TestLimaList_AllClusterQueriesFailReturns503DemoFallback(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewLimaHandlers(env.K8sClient)
	env.App.Get("/api/lima", handler.ListLima)

	client, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := client.(*k8sfake.Clientset)
	require.True(t, ok)

	fakeClient.PrependReactor("list", "nodes", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 10.0.0.1:443: connect: connection refused")
	})

	req, err := http.NewRequest(http.MethodGet, "/api/lima", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload LimaListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.True(t, payload.IsDemoData)
	assert.Len(t, payload.LimaInstances, 0)
}

func TestLimaList_LimaNodeDetectedFromLabels(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewLimaHandlers(env.K8sClient)
	env.App.Get("/api/lima", handler.ListLima)

	client, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	_, err = client.CoreV1().Nodes().Create(context.Background(), &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "worker-1",
			Labels: map[string]string{
				"lima.sh/instance": "default",
				"lima.sh/version":  "0.18.0",
			},
		},
		Status: corev1.NodeStatus{
			NodeInfo: corev1.NodeSystemInfo{
				OSImage:      "Ubuntu 22.04 LTS",
				Architecture: "x86_64",
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse("4000m"),
				corev1.ResourceMemory:           resource.MustParse("8Gi"),
				corev1.ResourceEphemeralStorage: resource.MustParse("60Gi"),
			},
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
		},
	}, metav1.CreateOptions{})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodGet, "/api/lima", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload LimaListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	require.Len(t, payload.LimaInstances, 1)
	assert.False(t, payload.IsDemoData)
	assert.Equal(t, "worker-1", payload.LimaInstances[0].Name)
	assert.Equal(t, "running", payload.LimaInstances[0].Status)
	assert.Equal(t, 4, payload.LimaInstances[0].CPUCores)
	assert.Equal(t, 8, payload.LimaInstances[0].MemoryGB)
	assert.Equal(t, 60, payload.LimaInstances[0].DiskGB)
	assert.Equal(t, "0.18.0", payload.LimaInstances[0].LimaVersion)
}
