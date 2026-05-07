package handlers

import (
	"encoding/json"
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
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestNamespaceHandlers(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNamespaceHandler(env.Store, env.K8sClient)

	// Register routes on the test app
	env.App.Get("/api/namespaces", h.ListNamespaces)
	env.App.Get("/api/namespaces/:name/access", h.GetNamespaceAccess)

	// Seed some namespaces into the fake cluster
	fakeClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)
	require.NotNil(t, fakeClient)
	_, _ = fakeClient.CoreV1().Namespaces().Create(t.Context(), &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: "ns-1"},
		Status:     corev1.NamespaceStatus{Phase: corev1.NamespaceActive},
	}, metav1.CreateOptions{})

	t.Run("ListNamespaces - Success", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/namespaces?cluster=test-cluster", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result []models.NamespaceDetails
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Len(t, result, 1)
		assert.Equal(t, "ns-1", result[0].Name)
	})

	t.Run("ListNamespaces - Missing Cluster", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/namespaces", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("ListNamespaces - Unauthorized", func(t *testing.T) {
		unknownUserID := uuid.New()
		// Mock store to return nil (user not found)
		env.Store.(*test.MockStore).On("GetUser", unknownUserID).Return(nil, nil)

		// Use a temporary app to inject a different user ID
		app := fiber.New()
		app.Get("/api/namespaces", func(c *fiber.Ctx) error {
			c.Locals("userID", unknownUserID)
			return h.ListNamespaces(c)
		})

		req := httptest.NewRequest("GET", "/api/namespaces?cluster=test-cluster", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("ListNamespaces - Cluster RBAC Forbidden", func(t *testing.T) {
		rbacEnv := setupTestEnv(t)
		rbacHandler := NewNamespaceHandler(rbacEnv.Store, rbacEnv.K8sClient)
		rbacEnv.App.Get("/api/namespaces", rbacHandler.ListNamespaces)

		rbacClient, err := rbacEnv.K8sClient.GetClient("test-cluster")
		require.NoError(t, err)
		require.NotNil(t, rbacClient)

		rbacClient.(*k8sfake.Clientset).PrependReactor("list", "namespaces", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewForbidden(schema.GroupResource{Resource: "namespaces"}, "", assert.AnError)
		})

		req := httptest.NewRequest("GET", "/api/namespaces?cluster=test-cluster", nil)
		resp, _ := rbacEnv.App.Test(req)

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("GetNamespaceAccess - Admin Success", func(t *testing.T) {
		// Seed a RoleBinding
		_, _ = fakeClient.RbacV1().RoleBindings("ns-1").Create(t.Context(), &rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{Name: "rb-1", Namespace: "ns-1"},
			RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: "admin"},
			Subjects: []rbacv1.Subject{
				{Kind: "User", Name: "admin-user", APIGroup: "rbac.authorization.k8s.io"},
			},
		}, metav1.CreateOptions{})

		req := httptest.NewRequest("GET", "/api/namespaces/ns-1/access?cluster=test-cluster", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result struct {
			Namespace string                        `json:"namespace"`
			Cluster   string                        `json:"cluster"`
			Bindings  []models.NamespaceAccessEntry `json:"bindings"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "ns-1", result.Namespace)
		assert.Len(t, result.Bindings, 1)
		assert.Equal(t, "rb-1", result.Bindings[0].BindingName)
		assert.Equal(t, "User", result.Bindings[0].SubjectKind)
		assert.Equal(t, "admin-user", result.Bindings[0].SubjectName)
	})

	t.Run("GetNamespaceAccess - Forbidden for Non-Admin", func(t *testing.T) {
		viewerID := uuid.New()
		env.Store.(*test.MockStore).On("GetUser", viewerID).Return(&models.User{
			ID:   viewerID,
			Role: models.UserRoleViewer,
		}, nil)

		app := fiber.New()
		app.Get("/api/namespaces/:name/access", func(c *fiber.Ctx) error {
			c.Locals("userID", viewerID)
			return h.GetNamespaceAccess(c)
		})

		req := httptest.NewRequest("GET", "/api/namespaces/ns-1/access?cluster=test-cluster", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("GetNamespaceAccess - Missing Parameters", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/namespaces/ns-1/access", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}
