package handlers

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/compliance/stig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSTIGHandlers(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSTIGHandler()
	h.RegisterPublicRoutes(env.App)

	t.Run("listBenchmarks", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/compliance/stig/benchmarks", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		t.Cleanup(func() { resp.Body.Close() })

		assert.Equal(t, 200, resp.StatusCode)
		var benchmarks []stig.Benchmark
		err = json.NewDecoder(resp.Body).Decode(&benchmarks)
		assert.NoError(t, err)
		assert.NotEmpty(t, benchmarks)
	})

	t.Run("listFindings", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/compliance/stig/findings", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		t.Cleanup(func() { resp.Body.Close() })

		assert.Equal(t, 200, resp.StatusCode)
		var findings []stig.Finding
		err = json.NewDecoder(resp.Body).Decode(&findings)
		assert.NoError(t, err)
		assert.NotEmpty(t, findings)
	})

	t.Run("getSummary", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/compliance/stig/summary", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		t.Cleanup(func() { resp.Body.Close() })

		assert.Equal(t, 200, resp.StatusCode)
		var summary stig.Summary
		err = json.NewDecoder(resp.Body).Decode(&summary)
		assert.NoError(t, err)
		assert.Greater(t, summary.TotalFindings, 0)
		assert.NotEmpty(t, summary.EvaluatedAt)
	})
}
