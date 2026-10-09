package gitops

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGitOpsDrift_ListDrifts(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGitOpsHandlers(nil, env.K8sClient, env.Store)

	// Populate cache
	req := DetectDriftRequest{
		RepoURL:   "https://github.com/test/repo",
		Path:      "manifests",
		Cluster:   "test-cluster",
		Namespace: "default",
	}
	res := &DetectDriftResponse{
		Drifted: true,
		Resources: []DriftedResource{
			{Name: "test-pod", Kind: "Pod", Namespace: "default", Field: "spec.containers[0].image", DiffOutput: "changed"},
		},
	}
	handler.rememberDrift(req, res)

	env.App.Get("/api/gitops/drifts", handler.ListDrifts)

	// Test list all
	httpReq, err := http.NewRequest(http.MethodGet, "/api/gitops/drifts", nil)
	require.NoError(t, err)
	httpReq.Host = "localhost"
	resp, err := env.App.Test(httpReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		Drifts []GitOpsDrift `json:"drifts"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.Drifts, 1)
	assert.Equal(t, "test-pod", body.Drifts[0].Resource)
	assert.Equal(t, "test-cluster", body.Drifts[0].Cluster)

	// Test filter by cluster
	httpReq, err = http.NewRequest(http.MethodGet, "/api/gitops/drifts?cluster=test-cluster", nil)
	require.NoError(t, err)
	httpReq.Host = "localhost"
	resp, err = env.App.Test(httpReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.Drifts, 1)

	httpReq, err = http.NewRequest(http.MethodGet, "/api/gitops/drifts?cluster=other-cluster", nil)
	require.NoError(t, err)
	httpReq.Host = "localhost"
	resp, err = env.App.Test(httpReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Len(t, body.Drifts, 0)
}

func TestGitOpsDrift_Validation_K8sName(t *testing.T) {
	tests := []struct {
		name    string
		isValid bool
	}{
		{"valid-name", true},
		{"ValidName123", true},
		{"name.with.dots", true},
		{"name_with_underscores", true},
		{"-invalid-start", false},
		{"invalid;char", false},
		{"invalid space", false},
		{"", true}, // empty is allowed by helper, callers handle requiredness
	}

	for _, tt := range tests {
		err := validateK8sName(tt.name, "field")
		if tt.isValid {
			assert.NoError(t, err, "expected %s to be valid", tt.name)
		} else {
			assert.Error(t, err, "expected %s to be invalid", tt.name)
		}
	}
}
