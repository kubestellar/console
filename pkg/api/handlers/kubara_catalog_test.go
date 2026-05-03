package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKubaraCatalogHandler_GetConfig(t *testing.T) {
	env := setupTestEnv(t)
	h := NewKubaraCatalogHandler("token", "org/repo", "path/to/helm")
	env.App.Get("/api/kubara/config", h.GetConfig)

	req := httptest.NewRequest("GET", "/api/kubara/config", nil)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var config map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&config)
	assert.Equal(t, "org/repo", config["repo"])
	assert.Equal(t, "path/to/helm", config["path"])
}

func TestKubaraCatalogHandler_GetCatalog(t *testing.T) {
	env := setupTestEnv(t)
	h := NewKubaraCatalogHandler("token", "org/repo", "path")
	env.App.Get("/api/kubara/catalog", h.GetCatalog)

	t.Run("demo mode", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/kubara/catalog", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		assert.Equal(t, "demo", respData["source"])
		assert.NotEmpty(t, respData["entries"])
	})

	t.Run("upstream fetch and cache", func(t *testing.T) {
		mockData := `[
			{"name": "chart1", "path": "path/chart1", "type": "dir"},
			{"name": "file1", "path": "path/file1", "type": "file"}
		]`

		callCount := 0
		h.httpClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
			callCount++
			assert.Contains(t, req.URL.String(), "api.github.com/repos/org/repo/contents/path")
			assert.Equal(t, "Bearer token", req.Header.Get("Authorization"))

			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(mockData)),
				Header:     make(http.Header),
			}
		})

		// First call - should fetch from upstream
		req := httptest.NewRequest("GET", "/api/kubara/catalog", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData struct {
			Entries []KubaraCatalogEntry `json:"entries"`
			Source  string               `json:"source"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		assert.Equal(t, "upstream", respData.Source)
		assert.Len(t, respData.Entries, 1) // Only 'dir' type should be included
		assert.Equal(t, "chart1", respData.Entries[0].Name)
		assert.Equal(t, 1, callCount)

		// Second call - should hit cache
		resp2, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp2.StatusCode)
		_ = json.NewDecoder(resp2.Body).Decode(&respData)
		assert.Equal(t, 1, callCount, "Should not have called upstream again")
	})

	t.Run("upstream error", func(t *testing.T) {
		h := NewKubaraCatalogHandler("", "fail/repo", "path")
		env.App.Get("/api/kubara/catalog/fail", h.GetCatalog)

		h.httpClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader(`{"message": "Not Found"}`)),
				Header:     make(http.Header),
			}
		})

		req := httptest.NewRequest("GET", "/api/kubara/catalog/fail", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		// Code returns StatusBadGateway (502) for any upstream error
		assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
	})
}
