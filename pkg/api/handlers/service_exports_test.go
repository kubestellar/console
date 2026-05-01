package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestServiceExportsHandlers_List(t *testing.T) {
	env := setupTestEnv(t)
	h := NewServiceExportHandlers(env.K8sClient)
	env.App.Get("/api/k8s/service-exports", h.ListServiceExports)

	// Create a mock ServiceExport unstructured object
	se1 := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "test-service",
				"namespace": "default",
				"creationTimestamp": "2023-01-01T00:00:00Z",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":    "Ready",
						"status":  "True",
						"reason":  "ServiceReady",
						"message": "Service is ready for export",
					},
				},
			},
		},
	}

	se2 := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "other-service",
				"namespace": "kube-system",
				"creationTimestamp": "2023-01-01T00:00:00Z",
			},
		},
	}

	// Inject clusters
	scheme := runtime.NewScheme()
	// #6483: register the List kind so the fake dynamic client can handle List() calls
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{
		Group:   "multicluster.x-k8s.io",
		Version: "v1alpha1",
		Kind:    "ServiceExportList",
	}, &unstructured.UnstructuredList{})

	injectDynamicClusterWithObjects(env, "cluster-1", scheme, []runtime.Object{se1})
	injectDynamicClusterWithObjects(env, "cluster-2", scheme, []runtime.Object{se2})

	t.Run("list all", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/k8s/service-exports", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData ServiceExportListResponse
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		exports := respData.Exports
		assert.Len(t, exports, 2)

		// Verify cluster-1 export
		var found1 bool
		for _, e := range exports {
			if e.Cluster == "cluster-1" {
				assert.Equal(t, "test-service", e.Name)
				assert.Equal(t, "default", e.Namespace)
				assert.Equal(t, "Ready", e.Status)
				found1 = true
			}
		}
		assert.True(t, found1)
	})

	t.Run("empty cluster", func(t *testing.T) {
		injectDynamicClusterWithObjects(env, "cluster-empty", scheme, []runtime.Object{})
		req := httptest.NewRequest("GET", "/api/k8s/service-exports", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData ServiceExportListResponse
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		// We still have 2 exports from other clusters
		assert.Len(t, respData.Exports, 2)
	})
}
