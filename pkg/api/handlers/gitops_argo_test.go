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

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

func createUnstructuredArgoApp(name, health, sync string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "argoproj.io/v1alpha1",
			"kind":       "Application",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": "argocd",
			},
			"status": map[string]interface{}{
				"sync": map[string]interface{}{
					"status": sync,
				},
				"health": map[string]interface{}{
					"status": health,
				},
			},
		},
	}
}

func createUnstructuredArgoAppSet(name, status string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "argoproj.io/v1alpha1",
			"kind":       "ApplicationSet",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": "argocd",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   "ResourcesUpToDate",
						"status": "True",
					},
				},
			},
		},
	}
}

func TestGitOpsArgo_ListArgoApplications(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	gvrKinds := map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationGVR: "ApplicationList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)
	_, err := dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("test-app", "Healthy", "Synced"), metav1.CreateOptions{})
	require.NoError(t, err)

	env.App.Get("/api/gitops/argocd/applications", handler.ListArgoApplications)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/argocd/applications", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Items []v1alpha1.ArgoApplication `json:"items"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.Items, 1)
	assert.Equal(t, "test-app", body.Items[0].Name)
}

func TestGitOpsArgo_GetArgoHealthSummary(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	gvrKinds := map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationGVR: "ApplicationList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)
	_, err := dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("app1", "Healthy", "Synced"), metav1.CreateOptions{})
	require.NoError(t, err)
	_, err = dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("app2", "Degraded", "OutOfSync"), metav1.CreateOptions{})
	require.NoError(t, err)

	env.App.Get("/api/gitops/argocd/health", handler.GetArgoHealthSummary)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/argocd/health", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Stats map[string]int `json:"stats"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, 1, body.Stats["healthy"])
	assert.Equal(t, 1, body.Stats["degraded"])
}

func TestGitOpsArgo_GetArgoSyncSummary(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	gvrKinds := map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationGVR: "ApplicationList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)
	_, err := dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("app1", "Healthy", "Synced"), metav1.CreateOptions{})
	require.NoError(t, err)
	_, err = dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("app2", "Degraded", "OutOfSync"), metav1.CreateOptions{})
	require.NoError(t, err)

	env.App.Get("/api/gitops/argocd/sync", handler.GetArgoSyncSummary)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/argocd/sync", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Stats map[string]int `json:"stats"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, 1, body.Stats["synced"])
	assert.Equal(t, 1, body.Stats["outOfSync"])
}

func TestGitOpsArgo_ListArgoApplicationSets(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	gvrKinds := map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationSetGVR: "ApplicationSetList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)
	_, err := dynClient.Resource(v1alpha1.ArgoApplicationSetGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoAppSet("test-appset", "Healthy"), metav1.CreateOptions{})
	require.NoError(t, err)

	env.App.Get("/api/gitops/argocd/applicationsets", handler.ListArgoApplicationSets)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/argocd/applicationsets", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Items []v1alpha1.ArgoApplicationSet `json:"items"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.Items, 1)
	assert.Equal(t, "test-appset", body.Items[0].Name)
}

func TestGitOpsArgo_GetArgoStatus(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	gvrKinds := map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationGVR:    "ApplicationList",
		v1alpha1.ArgoApplicationSetGVR: "ApplicationSetList",
	}
	dynClient := injectDynamicCluster(env, "test-cluster", gvrKinds)
	_, err := dynClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace("argocd").Create(context.Background(), createUnstructuredArgoApp("app1", "Healthy", "Synced"), metav1.CreateOptions{})
	require.NoError(t, err)

	env.App.Get("/api/gitops/argocd/status", handler.GetArgoStatus)

	req, err := http.NewRequest(http.MethodGet, "/api/gitops/argocd/status", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Detected bool                         `json:"detected"`
		Clusters []v1alpha1.ArgoClusterStatus `json:"clusters"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.True(t, body.Detected)
	assert.Len(t, body.Clusters, 1)
	assert.Equal(t, "test-cluster", body.Clusters[0].Name)
	assert.True(t, body.Clusters[0].HasApplications)
}

func TestGitOpsArgo_GetHelmValues_Validation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/gitops/helm/values", handler.GetHelmValues)

	// Missing release
	req, err := http.NewRequest(http.MethodGet, "/api/gitops/helm/values", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	// Invalid cluster name
	req, err = http.NewRequest(http.MethodGet, "/api/gitops/helm/values?release=my-rel&cluster=bad;name", nil)
	require.NoError(t, err)
	resp, err = env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
