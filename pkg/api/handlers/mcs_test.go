package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
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

	// Case 2: Specific cluster failure — error swallowed, returns 200
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("export list error")
	})
	req2, _ := http.NewRequest("GET", "/api/mcs/exports?cluster=test-cluster", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)
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

	// Client Error → 404
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("fail")
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

func TestCreateServiceExport(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCSHandlers(env.K8sClient, env.Hub)
	env.App.Post("/api/mcs/exports", handler.CreateServiceExport)

	dynClient := injectDynamicCluster(env, "c1", serviceExportGVRs())

	// Success reactor
	dynClient.PrependReactor("create", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.Unstructured{}, nil
	})

	// Case 1: Success
	payload := map[string]string{
		"cluster":     "c1",
		"namespace":   "default",
		"serviceName": "my-svc",
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/mcs/exports", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, 201, resp.StatusCode)

	// Verify creation via actions
	found := false
	for _, action := range dynClient.Actions() {
		if action.GetVerb() == "create" && action.GetResource().Resource == "serviceexports" {
			found = true
			break
		}
	}
	assert.True(t, found, "Create action not found")

	// Case 2: Validation Error (missing serviceName)
	payloadInvalid := map[string]string{
		"cluster":   "c1",
		"namespace": "default",
	}
	bodyInvalid, _ := json.Marshal(payloadInvalid)
	reqInvalid, _ := http.NewRequest("POST", "/api/mcs/exports", bytes.NewReader(bodyInvalid))
	reqInvalid.Header.Set("Content-Type", "application/json")

	respInvalid, err := env.App.Test(reqInvalid, 5000)
	require.NoError(t, err)
	require.NotNil(t, respInvalid)
	assert.Equal(t, 400, respInvalid.StatusCode)

	// Case 3: Client Error → 500
	dynClient.PrependReactor("create", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("create failed")
	})
	reqFail, _ := http.NewRequest("POST", "/api/mcs/exports", bytes.NewReader(body))
	reqFail.Header.Set("Content-Type", "application/json")

	respFail, err := env.App.Test(reqFail)
	require.NoError(t, err)
	require.NotNil(t, respFail)
	assert.Equal(t, 500, respFail.StatusCode)
}

func TestDeleteServiceExport(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCSHandlers(env.K8sClient, env.Hub)
	env.App.Delete("/api/mcs/exports/:cluster/:namespace/:name", handler.DeleteServiceExport)

	dynClient := injectDynamicCluster(env, "c1", serviceExportGVRs())

	// Success reactor
	dynClient.PrependReactor("delete", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, nil
	})

	// Case 1: Success
	req, _ := http.NewRequest("DELETE", "/api/mcs/exports/c1/default/svc1", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Case 2: Client Error → 500
	dynClient.PrependReactor("delete", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("delete failed")
	})
	reqFail, _ := http.NewRequest("DELETE", "/api/mcs/exports/c1/default/svc1", nil)
	respFail, err := env.App.Test(reqFail, 5000)
	require.NoError(t, err)
	assert.Equal(t, 500, respFail.StatusCode)
}
