package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestCRDListCRDs_Success(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewCRDHandlers(env.K8sClient)
	env.App.Get("/api/crds", handler.ListCRDs)

	// Inject dynamic objects for CRDs
	gvrKinds := map[schema.GroupVersionResource]string{
		{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}: "CustomResourceDefinitionList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)

	// Add a CRD
	crd := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": "tests.example.com",
			},
			"spec": map[string]interface{}{
				"group": "example.com",
				"names": map[string]interface{}{
					"kind": "Test",
				},
				"scope": "Namespaced",
				"versions": []interface{}{
					map[string]interface{}{
						"name":    "v1",
						"served":  true,
						"storage": true,
					},
				},
			},
		},
	}
	_, err := dynClient.Resource(gvrKindsToGVR(t, gvrKinds, "CustomResourceDefinitionList")).Create(context.Background(), crd, metav1.CreateOptions{})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodGet, "/api/crds", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result CRDListResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Len(t, result.CRDs, 1)
	assert.Equal(t, "tests", result.CRDs[0].Name)
	assert.Equal(t, "test-cluster", result.CRDs[0].Cluster)
}

func TestCRDListCRDs_NoClient(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewCRDHandlers(nil) // No client
	env.App.Get("/api/crds", handler.ListCRDs)

	req, err := http.NewRequest(http.MethodGet, "/api/crds", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var result CRDListResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.True(t, result.IsDemoData)
}
