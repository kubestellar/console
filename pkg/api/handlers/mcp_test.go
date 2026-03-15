package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestWaitWithDeadline_CompletesBeforeDeadline(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	go func() {
		defer wg.Done()
		time.Sleep(5 * time.Millisecond)
	}()

	timedOut := waitWithDeadline(&wg, 200*time.Millisecond)
	assert.False(t, timedOut)
}

func TestWaitWithDeadline_DeadlineHit(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	timedOut := waitWithDeadline(&wg, 10*time.Millisecond)
	assert.True(t, timedOut)

	wg.Done()
}

func TestMCPGetPods_DemoModeReturnsDemoData(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &payload))
	assert.Equal(t, "demo", payload["source"])

	pods, ok := payload["pods"].([]interface{})
	require.True(t, ok)
	assert.NotEmpty(t, pods)
}

func TestMCPGetPods_NoClusterAccessReturns503(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, nil)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "No cluster access available", payload["error"])
}

func TestMCPGetPods_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	pods, ok := payload["pods"].([]interface{})
	require.True(t, ok, "pods should be a JSON array, not null")
	assert.Len(t, pods, 0)
}

func TestMCPGetPods_InternalErrorIsSanitized(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	fakeClient.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forced pods list error")
	})

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "internal server error", payload["error"])
}

func TestMCPGetDaemonSets_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/daemonsets", handler.GetDaemonSets)

	req, err := http.NewRequest("GET", "/api/mcp/daemonsets?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	items, ok := payload["daemonsets"].([]interface{})
	require.True(t, ok, "daemonsets should be a JSON array, not null")
	assert.Len(t, items, 0)
}

func TestMCPGetEvents_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	req, err := http.NewRequest("GET", "/api/mcp/events?cluster=test-cluster&limit=10", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	assert.Equal(t, "test-cluster", payload["cluster"])

	events, ok := payload["events"].([]interface{})
	require.True(t, ok, "events should be a JSON array, not null")
	assert.Len(t, events, 0)
}
