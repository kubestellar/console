package handlers

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/compliance/licenses"
	"github.com/kubestellar/console/pkg/compliance/sbom"
	"github.com/kubestellar/console/pkg/compliance/signing"
	"github.com/kubestellar/console/pkg/compliance/slsa"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSupplyChainHandlers(t *testing.T) {
	env := setupTestEnv(t)

	t.Run("SBOMHandler", func(t *testing.T) {
		h := NewSBOMHandler()
		h.RegisterPublicRoutes(env.App)

		t.Run("getSummary", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/sbom/summary", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var summary sbom.Summary
			err = json.NewDecoder(resp.Body).Decode(&summary)
			assert.NoError(t, err)
			assert.Greater(t, summary.TotalWorkloads, 0)
		})

		t.Run("listDocuments", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/sbom/documents", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var documents []sbom.Document
			err = json.NewDecoder(resp.Body).Decode(&documents)
			assert.NoError(t, err)
		})
	})

	t.Run("SigningHandler", func(t *testing.T) {
		h := NewSigningHandler()
		h.RegisterPublicRoutes(env.App)

		t.Run("getSummary", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/signing/summary", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var summary signing.Summary
			err = json.NewDecoder(resp.Body).Decode(&summary)
			assert.NoError(t, err)
		})

		t.Run("listImages", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/signing/images", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var images []signing.Image
			err = json.NewDecoder(resp.Body).Decode(&images)
			assert.NoError(t, err)
		})

		t.Run("listPolicies", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/signing/policies", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var policies []signing.Policy
			err = json.NewDecoder(resp.Body).Decode(&policies)
			assert.NoError(t, err)
		})
	})

	t.Run("SLSAHandler", func(t *testing.T) {
		h := NewSLSAHandler()
		h.RegisterPublicRoutes(env.App)

		t.Run("getSummary", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/slsa/summary", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var summary slsa.Summary
			err = json.NewDecoder(resp.Body).Decode(&summary)
			assert.NoError(t, err)
		})

		t.Run("listWorkloads", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/slsa/workloads", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var workloads []slsa.Workload
			err = json.NewDecoder(resp.Body).Decode(&workloads)
			assert.NoError(t, err)
		})
	})

	t.Run("LicenseHandler", func(t *testing.T) {
		h := NewLicenseHandler()
		h.RegisterPublicRoutes(env.App)

		t.Run("getSummary", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/licenses/summary", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var summary licenses.Summary
			err = json.NewDecoder(resp.Body).Decode(&summary)
			assert.NoError(t, err)
		})

		t.Run("listPackages", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/licenses/packages", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var pkgs []licenses.Package
			err = json.NewDecoder(resp.Body).Decode(&pkgs)
			assert.NoError(t, err)
		})

		t.Run("listCategories", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/supply-chain/licenses/categories", nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			t.Cleanup(func() { resp.Body.Close() })
			assert.Equal(t, 200, resp.StatusCode)
			var categories []licenses.Category
			err = json.NewDecoder(resp.Body).Decode(&categories)
			assert.NoError(t, err)
		})
	})
}
