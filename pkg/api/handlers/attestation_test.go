package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAttestationHandler(t *testing.T) {
	env := setupTestEnv(t)
	h := NewAttestationHandler()

	h.RegisterPublicRoutes(env.App.Group("/api"))

	t.Run("GetScore", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/attestation/score", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result AttestationResponse
		err := json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)

		assert.NotEmpty(t, result.Clusters)
		
		// Verify scoring logic for one cluster
		cluster := result.Clusters[0]
		assert.NotEmpty(t, cluster.Cluster)
		assert.GreaterOrEqual(t, cluster.OverallScore, 0)
		assert.LessOrEqual(t, cluster.OverallScore, 100)
		assert.Len(t, cluster.Signals, 4)

		// Verify weights sum to 100
		totalWeight := 0
		for _, s := range cluster.Signals {
			totalWeight += s.Weight
		}
		assert.Equal(t, 100, totalWeight)
	})
}

func TestBuildDemoCluster(t *testing.T) {
	cluster := buildDemoCluster("test-cluster", 100, 100, 100, 100)
	assert.Equal(t, 100, cluster.OverallScore)
	assert.Empty(t, cluster.NonCompliantWorkloads)

	cluster = buildDemoCluster("failing-cluster", 0, 0, 0, 0)
	assert.Equal(t, 0, cluster.OverallScore)
	assert.Len(t, cluster.NonCompliantWorkloads, 4)
}
