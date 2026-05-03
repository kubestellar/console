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

// TestK8sLifecycle_Integration verifies issue #4.3:
// Backend ↔ Kubernetes API lifecycle (create → watch → update → delete).
// It uses the MultiClusterClient with a fake K8s backend to exercise the
// full life of a resource being observed by the Console.
func TestK8sLifecycle_Integration(t *testing.T) {
	env := setupTestEnv(t)
	clusterName := "lifecycle-cluster"
	fakeK8s := k8sfake.NewSimpleClientset()
	env.K8sClient.InjectClient(clusterName, fakeK8s)
	addClusterToRawConfig(env.K8sClient, clusterName)

	handler := NewMCPHandlers(nil, env.K8sClient, nil)

	// Mock auth
	adminID := uuid.New()
	mockStore := env.Store.(*test.MockStore)
	mockStore.On("GetUser", adminID).Return(&models.User{ID: adminID, Role: models.UserRoleAdmin}, nil).Maybe()
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", adminID)
		return c.Next()
	})

	env.App.Get("/api/mcp/pods", handler.GetPodsStream)

	// 1. Create - Pod appears in the API
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "test-pod", Namespace: "default"},
		Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "nginx", Image: "nginx"}}},
	}
	_, err := fakeK8s.CoreV1().Pods("default").Create(context.Background(), pod, metav1.CreateOptions{})
	require.NoError(t, err)

	// 2. Fetch via API - Verify it exists
	req := httptest.NewRequest(http.MethodGet, "/api/mcp/pods?cluster="+clusterName, nil)
	ClearSSECache()
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "test-pod")

	// 3. Update - Change pod labels
	pod.Labels = map[string]string{"env": "integration"}
	_, err = fakeK8s.CoreV1().Pods("default").Update(context.Background(), pod, metav1.UpdateOptions{})
	require.NoError(t, err)

	// Verify update is reflected
	ClearSSECache()
	resp2, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp2)
	body2, err := io.ReadAll(resp2.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body2), "integration")

	// 4. Delete - Pod removed from API
	err = fakeK8s.CoreV1().Pods("default").Delete(context.Background(), "test-pod", metav1.DeleteOptions{})
	require.NoError(t, err)

	// Verify deletion
	ClearSSECache()
	resp3, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp3)
	body3, err := io.ReadAll(resp3.Body)
	require.NoError(t, err)
	assert.NotContains(t, string(body3), "test-pod")
}

// TestK8sLifecycle_ErrorHandling verifies the Backend catches and surfaces K8s errors.
func TestK8sLifecycle_ErrorHandling(t *testing.T) {
	env := setupTestEnv(t)
	// We don't inject a client for "missing-cluster", so it should return 404

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/pods", handler.GetPodsStream)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/pods?cluster=missing-cluster", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)

	// According to mcp.go, unknown cluster returns 404
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
