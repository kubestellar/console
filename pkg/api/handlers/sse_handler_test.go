package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestSSEHandler_GetPodsStream_StreamsClusterData(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/workloads/pods/stream", handler.GetPodsStream)

	scheme := newK8sScheme()
	pod := &corev1.Pod{
		TypeMeta: metav1.TypeMeta{Kind: "Pod", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "stream-pod",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{Name: "c1", Image: "nginx"}},
		},
	}
	injectDynamicClusterWithObjects(env, "stream-cluster", scheme, []runtime.Object{pod}, pod)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/workloads/pods/stream?cluster=stream-cluster&namespace=default", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: "+sseEventClusterData)
	assert.Contains(t, body, `"cluster":"stream-cluster"`)
	assert.Contains(t, body, "stream-pod")
	assert.Contains(t, body, `"source":"k8s"`)
	assert.Contains(t, body, "event: "+sseEventDone)
}

func TestSSEHandler_GetPodsStream_NoClusterAccessReturns503(t *testing.T) {
	app := fiber.New()
	handler := NewMCPHandlers(nil, nil, nil)
	app.Get("/api/mcp/workloads/pods/stream", handler.GetPodsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/workloads/pods/stream", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var payload map[string]string
	require.NoError(t, json.Unmarshal(body, &payload))
	assert.Equal(t, noClusterAccessMsg, payload["error"])
}

func TestSSEHandler_FindPodIssuesStream_WithoutClientReturnsEmptyStream(t *testing.T) {
	app := fiber.New()
	handler := NewMCPHandlers(nil, nil, nil)
	app.Get("/api/mcp/workloads/pod-issues/stream", handler.FindPodIssuesStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/workloads/pod-issues/stream", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	bodyStr := string(body)
	assert.Contains(t, bodyStr, "event: "+sseEventDone)
	assert.Contains(t, bodyStr, `"totalClusters":0`)
	assert.Contains(t, bodyStr, `"completedClusters":0`)
	assert.Contains(t, bodyStr, `"skippedOffline":0`)
	assert.NotContains(t, bodyStr, "event: "+sseEventClusterData)
}

func TestSSEHandler_GetPodsStream_DemoModeStreamsDemoPayload(t *testing.T) {
	app := fiber.New()
	handler := NewMCPHandlers(nil, nil, nil)
	app.Get("/api/mcp/workloads/pods/stream", handler.GetPodsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/workloads/pods/stream", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	bodyStr := string(body)
	assert.Contains(t, bodyStr, "event: "+sseEventClusterData)
	assert.Contains(t, bodyStr, `"cluster":"demo"`)
	assert.Contains(t, bodyStr, `"source":"demo"`)
	assert.Contains(t, bodyStr, "event: "+sseEventDone)
}
