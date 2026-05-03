package handlers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

// TestSSE_Integration_Propagation verifies issue #4.3:
// SSE event propagation (cluster event -> backend -> frontend).
func TestSSE_Integration_Propagation(t *testing.T) {
	env := setupTestEnv(t)

	// 1. Setup a cluster with a fake k8s client that we can trigger events on
	clusterName := "cluster-integration"
	fakeK8s := k8sfake.NewSimpleClientset()
	env.K8sClient.InjectClient(clusterName, fakeK8s)
	addClusterToRawConfig(env.K8sClient, clusterName)

	// 2. Setup the handler and app
	handler := NewMCPHandlers(nil, env.K8sClient, nil)

	adminID := uuid.New()
	mockStore := env.Store.(*test.MockStore)
	mockStore.On("GetUser", adminID).Return(&models.User{
		ID:   adminID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", adminID)
		return c.Next()
	})

	env.App.Get("/api/mcp/events/warnings/stream", handler.GetWarningEventsStream)

	// 3. Seed the event BEFORE the request
	event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-warning",
			Namespace: "default",
		},
		Type:    corev1.EventTypeWarning,
		Reason:  "TestReason",
		Message: "Test Message",
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "test-pod",
		},
	}
	_, err := fakeK8s.CoreV1().Events("default").Create(context.Background(), event, metav1.CreateOptions{})
	require.NoError(t, err)

	// 4. Connect to SSE stream
	req := httptest.NewRequest(http.MethodGet, "/api/mcp/events/warnings/stream?cluster="+clusterName, nil)

	// We need to use a timeout smaller than the infinite stream but enough to catch the event
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// 5. Read and parse the stream
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	bodyStr := string(body)

	// Verify we got the event data
	assert.Contains(t, bodyStr, "event: cluster_data")
	assert.Contains(t, bodyStr, "\"cluster\":\"cluster-integration\"")
	assert.Contains(t, bodyStr, "TestReason")
	assert.Contains(t, bodyStr, "Test Message")
}

// TestSSE_Integration_MultiCluster verifies that events from multiple clusters
// are aggregated into the single SSE stream.
func TestSSE_Integration_MultiCluster(t *testing.T) {
	env := setupTestEnv(t)

	clusters := []string{"c1", "c2"}
	for _, c := range clusters {
		fc := k8sfake.NewSimpleClientset(&corev1.Event{
			ObjectMeta: metav1.ObjectMeta{Name: c + "-event", Namespace: "default"},
			Type:       corev1.EventTypeWarning,
			Reason:     c + "-reason",
			Message:    c + "-msg",
		})
		env.K8sClient.InjectClient(c, fc)
		addClusterToRawConfig(env.K8sClient, c)
	}

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/events/warnings/stream", handler.GetWarningEventsStream)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/events/warnings/stream", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	bodyStr := string(body)

	assert.Contains(t, bodyStr, "c1-reason")
	assert.Contains(t, bodyStr, "c2-reason")
	assert.Contains(t, bodyStr, "event: done")
}
