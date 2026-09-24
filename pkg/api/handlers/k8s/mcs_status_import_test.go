package k8s

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	k8sclient "github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- GetMCSStatus ----------

func TestGetMCSStatus_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)
	handler := &MCSHandlers{k8sClient: nil, hub: env.Hub}
	env.App.Get("/api/mcs/status", handler.GetMCSStatus)

	req, err := http.NewRequest("GET", "/api/mcs/status", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetMCSStatus_HealthyClustersError(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{
		healthyClustersFunc: func(ctx context.Context) ([]k8sclient.ClusterInfo, []k8sclient.ClusterInfo, error) {
			return nil, nil, errors.New("discovery failed")
		},
	}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/status", handler.GetMCSStatus)

	req, err := http.NewRequest("GET", "/api/mcs/status", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestGetMCSStatus_Success(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{
		healthyClustersFunc: func(ctx context.Context) ([]k8sclient.ClusterInfo, []k8sclient.ClusterInfo, error) {
			return []k8sclient.ClusterInfo{{Name: "cluster-a"}, {Name: "cluster-b"}}, nil, nil
		},
		isMCSAvailableFunc: func(ctx context.Context, contextName string) bool {
			return contextName == "cluster-a"
		},
	}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/status", handler.GetMCSStatus)

	req, err := http.NewRequest("GET", "/api/mcs/status", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var result struct {
		Clusters []struct {
			Cluster      string `json:"cluster"`
			MCSAvailable bool   `json:"mcsAvailable"`
		} `json:"clusters"`
	}
	require.NoError(t, json.Unmarshal(body, &result))
	require.Len(t, result.Clusters, 2)
	assert.Equal(t, "cluster-a", result.Clusters[0].Cluster)
	assert.True(t, result.Clusters[0].MCSAvailable)
	assert.Equal(t, "cluster-b", result.Clusters[1].Cluster)
	assert.False(t, result.Clusters[1].MCSAvailable)
}

// ---------- GetServiceImport ----------

func TestGetServiceImport_NoClusterAccess(t *testing.T) {
	env := setupTestEnv(t)
	handler := &MCSHandlers{k8sClient: nil, hub: env.Hub}
	env.App.Get("/api/mcs/imports/:cluster/:namespace/:name", handler.GetServiceImport)

	req, err := http.NewRequest("GET", "/api/mcs/imports/c1/default/my-svc", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetServiceImport_InvalidNamespace(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/imports/:cluster/:namespace/:name", handler.GetServiceImport)

	req, err := http.NewRequest("GET", "/api/mcs/imports/c1/Bad_NS/my-svc", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetServiceImport_ListError(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{
		listServiceImportsForClusterFunc: func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
			return nil, errors.New("list failed")
		},
	}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/imports/:cluster/:namespace/:name", handler.GetServiceImport)

	req, err := http.NewRequest("GET", "/api/mcs/imports/c1/default/my-svc", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestGetServiceImport_NotFound(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{
		listServiceImportsForClusterFunc: func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
			return []v1alpha1.ServiceImport{}, nil
		},
	}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/imports/:cluster/:namespace/:name", handler.GetServiceImport)

	req, err := http.NewRequest("GET", "/api/mcs/imports/c1/default/missing-svc", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestGetServiceImport_Found(t *testing.T) {
	env := setupTestEnv(t)
	mock := &mockMCSClient{
		listServiceImportsForClusterFunc: func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
			return []v1alpha1.ServiceImport{
				{Name: "other-svc"},
				{Name: "my-svc"},
			}, nil
		},
	}
	handler := &MCSHandlers{k8sClient: mock, hub: env.Hub}
	env.App.Get("/api/mcs/imports/:cluster/:namespace/:name", handler.GetServiceImport)

	req, err := http.NewRequest("GET", "/api/mcs/imports/c1/default/my-svc", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var got v1alpha1.ServiceImport
	require.NoError(t, json.Unmarshal(body, &got))
	assert.Equal(t, "my-svc", got.Name)
}
