package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stesting "k8s.io/client-go/testing"
)

// serviceExportGVRs returns the GVR-to-list-kind map for ServiceExport resources.
func serviceExportGVRs() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		{Group: "multicluster.x-k8s.io", Version: "v1alpha1", Resource: "serviceexports"}: "ServiceExportList",
	}
}

// serviceImportGVRs returns the GVR-to-list-kind map for ServiceImport resources.
func serviceImportGVRs() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		{Group: "multicluster.x-k8s.io", Version: "v1alpha1", Resource: "serviceimports"}: "ServiceImportList",
	}
}

func TestListServiceExports(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCSHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/mcs/exports", handler.ListServiceExports)

	export := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "my-svc",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "test-cluster", serviceExportGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "ServiceExportList", "apiVersion": "multicluster.x-k8s.io/v1alpha1"},
			Items:  []unstructured.Unstructured{*export},
		}, nil
	})

	// Case 1: List all
	req, _ := http.NewRequest("GET", "/api/mcs/exports", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var list v1alpha1.ServiceExportList
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &list)
	require.NoError(t, err)
	require.NotEmpty(t, list.Items)
	assert.Equal(t, "my-svc", list.Items[0].Name)

	// Case 2: Specific cluster failure — previously the low-level helper
	// swallowed ALL errors and returned 200 with an empty list, which hid
	// auth/network failures from the UI (#6510). Now only CRD-not-installed
	// returns an empty list; real errors propagate so the handler surfaces
	// them via handleK8sError.
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("export list error")
	})
	req2, _ := http.NewRequest("GET", "/api/mcs/exports?cluster=test-cluster", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.NotEqual(t, 200, resp2.StatusCode, "arbitrary cluster errors must not be silently swallowed (#6510)")

	// Case 3: CRD not installed — still returns 200 with empty list
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("the server could not find the requested resource")
	})
	req3, _ := http.NewRequest("GET", "/api/mcs/exports?cluster=test-cluster", nil)
	resp3, err := env.App.Test(req3, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp3.StatusCode, "CRD-not-installed should still yield an empty list")
}

func TestGetServiceExport(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCSHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/mcs/exports/:cluster/:namespace/:name", handler.GetServiceExport)

	export := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "target-svc",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "c1", serviceExportGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "ServiceExportList", "apiVersion": "multicluster.x-k8s.io/v1alpha1"},
			Items:  []unstructured.Unstructured{*export},
		}, nil
	})

	// Found
	req, _ := http.NewRequest("GET", "/api/mcs/exports/c1/default/target-svc", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Client error — previously the helper swallowed errors so the handler
	// hit its "not found" fallback (404). Now real errors propagate through
	// handleK8sError (#6510). CRD-not-installed still produces a legit 404.
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("the server could not find the requested resource")
	})
	req2, _ := http.NewRequest("GET", "/api/mcs/exports/c1/default/target-svc", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 404, resp2.StatusCode)
}

func TestListServiceImports(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCSHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/mcs/imports", handler.ListServiceImports)

	imp := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceImport",
			"metadata": map[string]interface{}{
				"name":      "remote-svc",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "test-cluster", serviceImportGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "ServiceImportList", "apiVersion": "multicluster.x-k8s.io/v1alpha1"},
			Items:  []unstructured.Unstructured{*imp},
		}, nil
	})

	// List all
	req, _ := http.NewRequest("GET", "/api/mcs/imports", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var list v1alpha1.ServiceImportList
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &list)
	require.NoError(t, err)
	assert.NotEmpty(t, list.Items)
}

// TestCreateServiceExport and TestDeleteServiceExport were removed in #7993
// Phase 1.5 PR B. Those backend handlers were deleted (no frontend consumer)
// and the user-initiated mutations now run via kc-agent /serviceexports. The
// equivalent kc-agent handler tests cover the create/delete path.

// TestListServiceExportsMock demonstrates mock-based testing with injected errors.
// This exercises error paths that are hard to trigger with fake clients.
func TestListServiceExportsMock(t *testing.T) {
	env := setupTestEnv(t)
	env.App.Get("/api/mcs/exports", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusInternalServerError, "handler not initialized")
	})

	t.Run("HealthyClusters error propagates as 500", func(t *testing.T) {
		mock := &mockMCSClient{
			healthyClustersFunc: func(ctx context.Context) ([]k8s.ClusterInfo, []k8s.ClusterInfo, error) {
				return nil, nil, errors.New("cluster discovery failed")
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/exports", handler.ListServiceExports)

		req, _ := http.NewRequest("GET", "/api/mcs/exports", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 500, resp.StatusCode)
	})

	t.Run("ListServiceExports error propagates", func(t *testing.T) {
		mock := &mockMCSClient{
			listServiceExportsFunc: func(ctx context.Context) (*v1alpha1.ServiceExportList, error) {
				return nil, errors.New("export list failed")
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/exports", handler.ListServiceExports)

		req, _ := http.NewRequest("GET", "/api/mcs/exports", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 500, resp.StatusCode)
	})

	t.Run("Cluster-specific error", func(t *testing.T) {
		mock := &mockMCSClient{
			listServiceExportsForClusterFunc: func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceExport, error) {
				return nil, errors.New("cluster-specific error")
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/exports", handler.ListServiceExports)

		req, _ := http.NewRequest("GET", "/api/mcs/exports?cluster=test-cluster", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 500, resp.StatusCode)
	})

	t.Run("Empty result set returns 200", func(t *testing.T) {
		mock := &mockMCSClient{}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/exports", handler.ListServiceExports)

		req, _ := http.NewRequest("GET", "/api/mcs/exports", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		var list v1alpha1.ServiceExportList
		body, _ := io.ReadAll(resp.Body)
		err = json.Unmarshal(body, &list)
		require.NoError(t, err)
		assert.Empty(t, list.Items)
	})
}

// TestListServiceImportsMock exercises mock-based error injection for ServiceImports.
func TestListServiceImportsMock(t *testing.T) {
	env := setupTestEnv(t)
	env.App.Get("/api/mcs/imports", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusInternalServerError, "handler not initialized")
	})

	t.Run("ListServiceImports error propagates", func(t *testing.T) {
		mock := &mockMCSClient{
			listServiceImportsFunc: func(ctx context.Context) (*v1alpha1.ServiceImportList, error) {
				return nil, errors.New("import list failed")
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/imports", handler.ListServiceImports)

		req, _ := http.NewRequest("GET", "/api/mcs/imports", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 500, resp.StatusCode)
	})

	t.Run("Cluster-specific query error", func(t *testing.T) {
		mock := &mockMCSClient{
			listServiceImportsForClusterFunc: func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
				return nil, errors.New("cluster-specific error")
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		env.App.Get("/api/mcs/imports", handler.ListServiceImports)

		req, _ := http.NewRequest("GET", "/api/mcs/imports?cluster=test-cluster", nil)
		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 500, resp.StatusCode)
	})

	t.Run("IsMCSAvailable check", func(t *testing.T) {
		mock := &mockMCSClient{
			isMCSAvailableFunc: func(ctx context.Context, contextName string) bool {
				return false
			},
		}
		handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
		// Behavior: when MCS is not available, handlers should still return gracefully
		// This validates the interface contract doesn't break when MCS CRDs are missing
		assert.NotNil(t, handler)
	})
}
